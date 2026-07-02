import { randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { AppError } from "../../../errors/app-error.js";
import { prisma } from "../../../infrastructure/postgres/client.js";
import { isCanvasRuntimeMock, areCanvasFeesDisabled } from "../../../config/canvas.js";
import { recordCanvasActionFee } from "../fee/canvas-fee.service.js";
import { compileWorkflow } from "../compiler/compile-workflow.js";
import type { CompiledWorkflow, CompiledWorkflowNode } from "../compiler/compiled-workflow.types.js";
import { loadWorkflowGraph } from "../canvas-workflow.service.js";
import { loadPolicyForWorkflow } from "../policy/canvas-policy.service.js";
import { assertKillSwitchClear } from "../policy/canvas-kill-switch.js";
import {
  emitLiveRunComplete,
  emitLiveRunKilled,
  emitLiveRunNodeComplete,
  emitLiveRunNodeExecuted,
  emitLiveRunNodeStart,
  emitLiveRunPolicyDenied,
  emitLiveRunStarted,
  setCanvasLiveRunId,
} from "./canvas-live-progress-context.js";
import { resolveLiveHandler } from "./live-node-registry.js";
import type { NodePortOutputs } from "./nodes/workflow-nodes.js";

export type LiveRunResult = {
  runId: string;
  status: "completed" | "failed" | "cancelled";
  summary: string;
  warnings: string[];
  nodesExecuted: number;
  executedActions: number;
  compiled: CompiledWorkflow;
};

export type ExecuteLiveRunInput = {
  privyUserId: string;
  workflowId: string;
  autoApprove?: boolean;
  confirmLive?: boolean;
};

async function requireUserId(privyUserId: string): Promise<bigint> {
  const user = await prisma.user.findUnique({ where: { privy_user_id: privyUserId } });
  if (!user) {
    throw new AppError(404, "USER_NOT_FOUND", "User profile not found.");
  }
  return user.id;
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
      if (!visited.has(edge.target.node_id)) queue.push(edge.target.node_id);
    }
  }

  return compiled.execution_order
    .filter((id) => visited.has(id))
    .map((id) => nodeById.get(id)!)
    .filter(Boolean);
}

export async function executeLiveGraphRun(input: ExecuteLiveRunInput): Promise<LiveRunResult> {
  const userId = await requireUserId(input.privyUserId);
  const { workflow, graph } = await loadWorkflowGraph(input.privyUserId, input.workflowId);
  const policy = await loadPolicyForWorkflow(workflow.id, workflow.policy_id);

  if (policy.require_deploy_approval && !input.confirmLive) {
    throw new AppError(
      400,
      "LIVE_CONFIRMATION_REQUIRED",
      "Live execution requires explicit confirmation (confirm_live: true).",
    );
  }

  const compileResult = compileWorkflow({
    workflowId: workflow.id,
    revision: workflow.revision,
    graph,
    policy,
    enforcePolicyHard: true,
  });

  if (!compileResult.ok) {
    throw new AppError(400, "COMPILE_ERROR", "Workflow failed to compile for Live.", {
      errors: compileResult.errors,
    });
  }

  const compiled = compileResult.compiled;

  try {
    await assertKillSwitchClear(workflow.id);
  } catch {
    const runId = randomUUID();
    setCanvasLiveRunId(runId);
    await prisma.canvasWorkflowRun.create({
      data: {
        id: runId,
        workflow_id: workflow.id,
        user_id: userId,
        mode: "live",
        status: "cancelled",
        workflow_revision: workflow.revision,
        started_at: new Date(),
        finished_at: new Date(),
        error_message: "Kill switch is active — execution halted before sign.",
      },
    });
    emitLiveRunKilled(runId, "Kill switch is active — execution halted before sign.");
    await persistRunEvent(runId, "workflow.run.killed", {
      message: "Kill switch is active — execution halted before sign.",
    });
    return {
      runId,
      status: "cancelled",
      summary: "Live run halted by kill switch.",
      warnings: compiled.policy_warnings.map((w) => w.message),
      nodesExecuted: 0,
      executedActions: 0,
      compiled,
    };
  }
  const runId = randomUUID();
  setCanvasLiveRunId(runId);

  await prisma.canvasWorkflowRun.create({
    data: {
      id: runId,
      workflow_id: workflow.id,
      user_id: userId,
      mode: "live",
      status: "running",
      workflow_revision: workflow.revision,
      started_at: new Date(),
    },
  });

  await prisma.canvasWorkflowRuntime.upsert({
    where: { workflow_id: workflow.id },
    create: {
      id: randomUUID(),
      workflow_id: workflow.id,
      compiled_hash: compiled.compiled_hash,
      compiled_bundle: compiled as unknown as Prisma.InputJsonValue,
      status: "active",
      worker_id: `local:${process.pid}`,
    },
    update: {
      compiled_hash: compiled.compiled_hash,
      compiled_bundle: compiled as unknown as Prisma.InputJsonValue,
      status: "active",
      worker_id: `local:${process.pid}`,
    },
  });

  await prisma.canvasWorkflow.update({
    where: { id: workflow.id },
    data: { status: "live" },
  });

  emitLiveRunStarted(runId, workflow.id, compiled.compiled_hash);
  await persistRunEvent(runId, "workflow.run.started", {
    workflow_id: workflow.id,
    mode: "live",
    compiled_hash: compiled.compiled_hash,
  });

  const portOutputs = new Map<string, NodePortOutputs>();
  const runWarnings = compiled.policy_warnings.map((w) => w.message);
  let nodesExecuted = 0;
  let executedActions = 0;
  let failed = false;
  let cancelled = false;

  const nodesToRun = gatherReachableNodes(compiled);

  for (const node of nodesToRun) {
    await assertKillSwitchClear(workflow.id);

    const started = Date.now();
    emitLiveRunNodeStart(runId, node.id, node.resolved_type);
    await persistRunEvent(runId, "workflow.run.node.start", {
      node_id: node.id,
      node_type: node.resolved_type,
    });

    try {
      const handler = resolveLiveHandler(node.resolved_type);
      const result = await handler({
        runId,
        workflowId: workflow.id,
        privyUserId: input.privyUserId,
        policy,
        node,
        upstream: collectUpstream(node, portOutputs),
        autoApprove: input.autoApprove ?? true,
      });

      portOutputs.set(node.id, result.outputs);
      const durationMs = Date.now() - started;

      if (result.skipped) {
        emitLiveRunNodeComplete({
          runId,
          nodeId: node.id,
          nodeType: node.resolved_type,
          status: "skipped",
          detail: result.detail,
          durationMs,
        });
      } else {
        nodesExecuted += 1;
        if (result.executed) {
          executedActions += 1;
          emitLiveRunNodeExecuted(runId, node.id, node.resolved_type, result.outputs.data);
          await persistRunEvent(runId, "workflow.run.node.executed", {
            node_id: node.id,
            payload: result.outputs.data,
            tx_hash: result.tx_hash,
            explorer_url: result.explorer_url,
            evm_chain_id: result.evm_chain_id,
          });

          if (result.fee_usd && result.fee_usd > 0) {
            const feeInput = {
              runId,
              workflowId: workflow.id,
              privyUserId: input.privyUserId,
              nodeId: node.id,
              nodeType: node.resolved_type,
              estUsd: result.fee_usd,
              idempotencyKey: `${runId}:${node.id}`,
            };
            if (areCanvasFeesDisabled() || isCanvasRuntimeMock()) {
              await recordCanvasActionFee(feeInput);
            } else {
              const { inngest } = await import("../../../inngest/client.js");
              const { CANVAS_ACTION_COMPLETED_EVENT } = await import("../../../inngest/events.js");
              await inngest.send({
                name: CANVAS_ACTION_COMPLETED_EVENT,
                data: feeInput,
              });
            }
          }
        }

        emitLiveRunNodeComplete({
          runId,
          nodeId: node.id,
          nodeType: node.resolved_type,
          status: "ok",
          detail: result.detail,
          durationMs,
          executed: result.executed,
        });
      }

      await persistRunEvent(runId, "workflow.run.node.complete", {
        node_id: node.id,
        status: result.skipped ? "skipped" : "ok",
        detail: result.detail,
        duration_ms: durationMs,
        executed: result.executed ?? false,
      });

      if (node.resolved_type === "workflow_stop") break;
    } catch (err) {
      const code = err instanceof AppError ? err.code : "LIVE_NODE_FAILED";
      const message = err instanceof Error ? err.message : "Node execution failed";

      if (code === "POLICY_KILL_SWITCH") {
        cancelled = true;
        emitLiveRunKilled(runId, message);
        await persistRunEvent(runId, "workflow.run.killed", { message });
        break;
      }

      if (code.startsWith("POLICY_")) {
        emitLiveRunPolicyDenied(runId, code, message);
        await persistRunEvent(runId, "workflow.run.policy.denied", { code, message });
      }

      failed = true;
      emitLiveRunNodeComplete({
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

  const status = cancelled ? "cancelled" : failed ? "failed" : "completed";
  const summary = cancelled
    ? "Live run halted by kill switch."
    : failed
      ? "Live run failed — see node trace for details."
      : `Live run completed — ${nodesExecuted} nodes, ${executedActions} executed actions.`;

  await prisma.canvasWorkflowRun.update({
    where: { id: runId },
    data: {
      status,
      finished_at: new Date(),
      error_message: failed || cancelled ? summary : null,
    },
  });

  if (cancelled) {
    await prisma.canvasWorkflow.update({
      where: { id: workflow.id },
      data: { status: "paused" },
    });
    await prisma.canvasWorkflowRuntime.update({
      where: { workflow_id: workflow.id },
      data: { status: "stopped" },
    });
  }

  emitLiveRunComplete({
    runId,
    status,
    summary,
    warnings: runWarnings,
    nodesExecuted,
    executedActions,
  });
  await persistRunEvent(runId, "workflow.run.complete", {
    status,
    summary,
    warnings: runWarnings,
    nodes_executed: nodesExecuted,
    executed_actions: executedActions,
  });

  return {
    runId,
    status,
    summary,
    warnings: runWarnings,
    nodesExecuted,
    executedActions,
    compiled,
  };
}

export async function stopLiveWorkflow(
  privyUserId: string,
  workflowId: string,
): Promise<{ stopped: true }> {
  const userId = await requireUserId(privyUserId);
  const workflow = await prisma.canvasWorkflow.findFirst({
    where: { id: workflowId, user_id: userId },
  });
  if (!workflow) {
    throw new AppError(404, "WORKFLOW_NOT_FOUND", "Canvas workflow not found.");
  }

  await prisma.canvasWorkflow.update({
    where: { id: workflowId },
    data: { status: "paused" },
  });
  await prisma.canvasWorkflowRuntime.updateMany({
    where: { workflow_id: workflowId },
    data: { status: "stopped" },
  });

  return { stopped: true };
}
