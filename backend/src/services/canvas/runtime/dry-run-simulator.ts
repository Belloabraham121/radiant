import { randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { AppError } from "../../../errors/app-error.js";
import { prisma } from "../../../infrastructure/postgres/client.js";
import { compileWorkflow } from "../compiler/compile-workflow.js";
import type { CompiledWorkflow, CompiledWorkflowNode } from "../compiler/compiled-workflow.types.js";
import { loadWorkflowGraph } from "../canvas-workflow.service.js";
import { parseCanvasPolicy } from "../policy/canvas-policy.schema.js";
import {
  emitWorkflowApprovePendingDryRun,
  emitWorkflowRunComplete,
  emitWorkflowRunNodeComplete,
  emitWorkflowRunNodeSimulated,
  emitWorkflowRunNodeStart,
  emitWorkflowRunPolicyWarning,
  emitWorkflowRunStarted,
  setCanvasDryRunRunId,
} from "../test/canvas-test-progress-context.js";
import { resolveDryRunHandler } from "./dry-run-node-registry.js";
import type { NodePortOutputs } from "./nodes/workflow-nodes.js";

export type DryRunSimulationResult = {
  runId: string;
  status: "completed" | "failed";
  summary: string;
  warnings: string[];
  nodesExecuted: number;
  simulatedActions: number;
  compiled: CompiledWorkflow;
};

export type ExecuteDryRunInput = {
  privyUserId: string;
  workflowId: string;
  autoApprove?: boolean;
};

async function requireUserId(privyUserId: string): Promise<bigint> {
  const user = await prisma.user.findUnique({ where: { privy_user_id: privyUserId } });
  if (!user) {
    throw new AppError(404, "USER_NOT_FOUND", "User profile not found.");
  }
  return user.id;
}

async function loadPolicy(workflowId: string, policyId: string) {
  const row = await prisma.canvasWorkflowPolicy.findFirst({
    where: { id: policyId, workflow_id: workflowId },
  });
  if (!row) {
    throw new AppError(404, "POLICY_NOT_FOUND", "Canvas workflow policy not found.");
  }
  return parseCanvasPolicy(row.policy);
}

async function persistRunEvent(
  runId: string,
  eventType: string,
  payload: Record<string, unknown>,
): Promise<void> {
  await prisma.canvasWorkflowRunEvent.create({
    data: {
      id: randomUUID(),
      run_id: runId,
      event_type: eventType,
      payload: payload as Prisma.InputJsonValue,
    },
  });
}

function collectUpstream(
  node: CompiledWorkflowNode,
  portOutputs: Map<string, NodePortOutputs>,
): Map<string, unknown> {
  const upstream = new Map<string, unknown>();
  for (const edge of node.inputs) {
    const outputs = portOutputs.get(edge.source.node_id);
    if (outputs && edge.source.port in outputs) {
      upstream.set(`${edge.source.node_id}:${edge.source.port}`, outputs[edge.source.port]);
    }
  }
  return upstream;
}

function gatherReachableNodes(compiled: CompiledWorkflow): CompiledWorkflowNode[] {
  const nodeById = new Map(compiled.nodes.map((n) => [n.id, n]));
  const visited = new Set<string>();
  const queue = [...compiled.entry_node_ids];

  while (queue.length > 0) {
    const id = queue.shift()!;
    if (visited.has(id)) continue;
    visited.add(id);
    const node = nodeById.get(id);
    if (!node) continue;
    for (const edge of node.outputs) {
      if (!visited.has(edge.target.node_id)) {
        queue.push(edge.target.node_id);
      }
    }
  }

  return compiled.execution_order
    .filter((id) => visited.has(id))
    .map((id) => nodeById.get(id)!)
    .filter(Boolean);
}

export async function executeDryRunSimulation(
  input: ExecuteDryRunInput,
): Promise<DryRunSimulationResult> {
  const userId = await requireUserId(input.privyUserId);
  const { workflow, graph } = await loadWorkflowGraph(input.privyUserId, input.workflowId);
  const policy = await loadPolicy(workflow.id, workflow.policy_id);

  const compileResult = compileWorkflow({
    workflowId: workflow.id,
    revision: workflow.revision,
    graph,
    policy,
  });

  if (!compileResult.ok) {
    throw new AppError(400, "COMPILE_ERROR", "Workflow failed to compile.", {
      errors: compileResult.errors,
    });
  }

  const compiled = compileResult.compiled;
  const runId = randomUUID();
  setCanvasDryRunRunId(runId);

  await prisma.canvasWorkflowRun.create({
    data: {
      id: runId,
      workflow_id: workflow.id,
      user_id: userId,
      mode: "dry",
      status: "running",
      workflow_revision: workflow.revision,
      started_at: new Date(),
    },
  });

  emitWorkflowRunStarted(runId, workflow.id, compiled.compiled_hash);
  await persistRunEvent(runId, "workflow.run.started", {
    workflow_id: workflow.id,
    compiled_hash: compiled.compiled_hash,
  });

  if (compiled.policy_warnings.length > 0) {
    emitWorkflowRunPolicyWarning(runId, compiled.policy_warnings);
    await persistRunEvent(runId, "workflow.run.policy.warning", {
      warnings: compiled.policy_warnings,
    });
  }

  const portOutputs = new Map<string, NodePortOutputs>();
  const runWarnings = compiled.policy_warnings.map((w) => w.message);
  let nodesExecuted = 0;
  let simulatedActions = 0;
  let failed = false;

  const nodesToRun = gatherReachableNodes(compiled);

  for (const node of nodesToRun) {
    const started = Date.now();
    emitWorkflowRunNodeStart(runId, node.id, node.resolved_type);
    await persistRunEvent(runId, "workflow.run.node.start", {
      node_id: node.id,
      node_type: node.resolved_type,
    });

    try {
      const handler = resolveDryRunHandler(node.resolved_type);
      const result = await handler({
        runId,
        node,
        upstream: collectUpstream(node, portOutputs),
        autoApprove: input.autoApprove ?? true,
      });

      if (node.resolved_type === "workflow_approve" && !input.autoApprove) {
        const preview = result.outputs.trigger;
        emitWorkflowApprovePendingDryRun(node.id, runId, preview);
        await persistRunEvent(runId, "workflow.approve.pending", {
          node_id: node.id,
          payload_preview: preview,
        });
      }

      portOutputs.set(node.id, result.outputs);
      const durationMs = Date.now() - started;

      if (result.skipped) {
        emitWorkflowRunNodeComplete({
          runId,
          nodeId: node.id,
          nodeType: node.resolved_type,
          status: "skipped",
          detail: result.detail,
          durationMs,
        });
      } else {
        nodesExecuted += 1;
        if (result.simulated) {
          simulatedActions += 1;
          emitWorkflowRunNodeSimulated(runId, node.id, node.resolved_type, result.outputs.data);
          await persistRunEvent(runId, "workflow.run.node.simulated", {
            node_id: node.id,
            payload: result.outputs.data,
          });
        }
        if (result.warnings) {
          runWarnings.push(...result.warnings);
        }
        emitWorkflowRunNodeComplete({
          runId,
          nodeId: node.id,
          nodeType: node.resolved_type,
          status: "ok",
          detail: result.detail,
          durationMs,
          simulated: result.simulated,
        });
      }

      await persistRunEvent(runId, "workflow.run.node.complete", {
        node_id: node.id,
        status: result.skipped ? "skipped" : "ok",
        detail: result.detail,
        duration_ms: durationMs,
        simulated: result.simulated ?? false,
      });

      if (node.resolved_type === "workflow_stop") {
        break;
      }
    } catch (err) {
      failed = true;
      const message = err instanceof Error ? err.message : "Node execution failed";
      emitWorkflowRunNodeComplete({
        runId,
        nodeId: node.id,
        nodeType: node.resolved_type,
        status: "failed",
        detail: message,
        durationMs: Date.now() - started,
      });
      await persistRunEvent(runId, "workflow.run.node.complete", {
        node_id: node.id,
        status: "failed",
        detail: message,
      });
      break;
    }
  }

  const status = failed ? "failed" : "completed";
  const summary = failed
    ? "Dry run failed — see node trace for details."
    : `Dry run completed — ${nodesExecuted} nodes, ${simulatedActions} simulated actions.`;

  await prisma.canvasWorkflowRun.update({
    where: { id: runId },
    data: {
      status,
      finished_at: new Date(),
      error_message: failed ? summary : null,
    },
  });

  emitWorkflowRunComplete({
    runId,
    status,
    summary,
    warnings: runWarnings,
    nodesExecuted,
    simulatedActions,
  });
  await persistRunEvent(runId, "workflow.run.complete", {
    status,
    summary,
    warnings: runWarnings,
    nodes_executed: nodesExecuted,
    simulated_actions: simulatedActions,
  });

  return {
    runId,
    status,
    summary,
    warnings: runWarnings,
    nodesExecuted,
    simulatedActions,
    compiled,
  };
}
