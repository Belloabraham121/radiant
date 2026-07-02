import { AsyncLocalStorage } from "node:async_hooks";
import type {
  CanvasDryRunProgressEvent,
  CanvasDryRunStreamSender,
} from "./canvas-test-progress.types.js";
import type { PolicyBindingWarning } from "../compiler/compiled-workflow.types.js";
import type { CanvasAgentLlmConfig } from "../llm/canvas-llm.types.js";

type CanvasDryRunProgressStore = {
  send?: CanvasDryRunStreamSender;
  tester_config?: CanvasAgentLlmConfig;
  run_id?: string;
};

const storage = new AsyncLocalStorage<CanvasDryRunProgressStore>();

export type CanvasDryRunProgressContextOptions = {
  send: CanvasDryRunStreamSender;
  tester_config?: CanvasAgentLlmConfig;
};

export function runWithCanvasDryRunProgress<T>(
  options: CanvasDryRunProgressContextOptions,
  fn: () => Promise<T>,
): Promise<T> {
  return storage.run(
    {
      send: options.send,
      tester_config: options.tester_config,
    },
    fn,
  );
}

export function getCanvasTesterLlmConfig(): CanvasAgentLlmConfig {
  const store = storage.getStore();
  return {
    model_tier: store?.tester_config?.model_tier ?? "lite",
    provider: store?.tester_config?.provider ?? "openai",
  };
}

export function setCanvasDryRunRunId(runId: string): void {
  const store = storage.getStore();
  if (store) store.run_id = runId;
}

export function getCanvasDryRunRunId(): string | undefined {
  return storage.getStore()?.run_id;
}

function emit(event: CanvasDryRunProgressEvent): void {
  const send = storage.getStore()?.send;
  if (!send) return;
  const { type, ...payload } = event;
  send(type, payload);
}

export function emitWorkflowRunStarted(
  runId: string,
  workflowId: string,
  compiledHash: string,
): void {
  emit({
    type: "workflow.run.started",
    run_id: runId,
    workflow_id: workflowId,
    mode: "dry",
    compiled_hash: compiledHash,
  });
}

export function emitWorkflowRunNodeStart(
  runId: string,
  nodeId: string,
  nodeType: string,
): void {
  emit({
    type: "workflow.run.node.start",
    run_id: runId,
    node_id: nodeId,
    node_type: nodeType,
  });
}

export function emitWorkflowRunNodeComplete(input: {
  runId: string;
  nodeId: string;
  nodeType: string;
  status: "ok" | "skipped" | "failed";
  detail?: string;
  durationMs: number;
  simulated?: boolean;
}): void {
  emit({
    type: "workflow.run.node.complete",
    run_id: input.runId,
    node_id: input.nodeId,
    node_type: input.nodeType,
    status: input.status,
    detail: input.detail,
    duration_ms: input.durationMs,
    simulated: input.simulated,
  });
}

export function emitWorkflowRunNodeSimulated(
  runId: string,
  nodeId: string,
  nodeType: string,
  payload: unknown,
): void {
  emit({
    type: "workflow.run.node.simulated",
    run_id: runId,
    node_id: nodeId,
    node_type: nodeType,
    payload,
  });
}

export function emitWorkflowRunPolicyWarning(
  runId: string,
  warnings: PolicyBindingWarning[],
): void {
  emit({
    type: "workflow.run.policy.warning",
    run_id: runId,
    warnings,
  });
}

export function emitWorkflowRunComplete(input: {
  runId: string;
  status: "completed" | "failed";
  summary: string;
  warnings: string[];
  nodesExecuted: number;
  simulatedActions: number;
}): void {
  emit({
    type: "workflow.run.complete",
    run_id: input.runId,
    status: input.status,
    summary: input.summary,
    warnings: input.warnings,
    nodes_executed: input.nodesExecuted,
    simulated_actions: input.simulatedActions,
  });
}

export function emitWorkflowRunError(code: string, message: string, runId?: string): void {
  emit({
    type: "workflow.run.error",
    code,
    message,
    run_id: runId,
  });
}

export function emitWorkflowApprovePendingDryRun(
  nodeId: string,
  runId: string,
  payloadPreview: unknown,
): void {
  emit({
    type: "workflow.approve.pending",
    node_id: nodeId,
    run_id: runId,
    payload_preview: payloadPreview,
  });
}
