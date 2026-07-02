/** Stable SSE event names for Canvas Live runtime streaming. */
export const CANVAS_LIVE_PROGRESS_EVENT_NAMES = [
  "workflow.run.started",
  "workflow.run.node.start",
  "workflow.run.node.complete",
  "workflow.run.node.executed",
  "workflow.run.policy.warning",
  "workflow.run.policy.denied",
  "workflow.approve.pending",
  "workflow.run.complete",
  "workflow.run.error",
  "workflow.run.killed",
] as const;

export type CanvasLiveProgressEventName =
  (typeof CANVAS_LIVE_PROGRESS_EVENT_NAMES)[number];

export type CanvasLiveStreamSender = (
  event: CanvasLiveProgressEventName,
  data: Record<string, unknown>,
) => void;

export type CanvasLiveProgressContext = {
  send: CanvasLiveStreamSender;
  run_id?: string;
};

let liveContext: CanvasLiveProgressContext | null = null;

export function runWithCanvasLiveProgress<T>(
  ctx: CanvasLiveProgressContext,
  fn: () => Promise<T>,
): Promise<T> {
  liveContext = ctx;
  return fn().finally(() => {
    liveContext = null;
  });
}

function emit(event: CanvasLiveProgressEventName, data: Record<string, unknown>): void {
  liveContext?.send(event, data);
}

export function setCanvasLiveRunId(runId: string): void {
  if (liveContext) liveContext.run_id = runId;
}

export function emitLiveRunStarted(
  runId: string,
  workflowId: string,
  compiledHash: string,
): void {
  emit("workflow.run.started", {
    run_id: runId,
    workflow_id: workflowId,
    mode: "live",
    compiled_hash: compiledHash,
  });
}

export function emitLiveRunNodeStart(runId: string, nodeId: string, nodeType: string): void {
  emit("workflow.run.node.start", { run_id: runId, node_id: nodeId, node_type: nodeType });
}

export function emitLiveRunNodeComplete(input: {
  runId: string;
  nodeId: string;
  nodeType: string;
  status: "ok" | "skipped" | "failed";
  detail?: string;
  durationMs: number;
  executed?: boolean;
}): void {
  emit("workflow.run.node.complete", {
    run_id: input.runId,
    node_id: input.nodeId,
    node_type: input.nodeType,
    status: input.status,
    detail: input.detail,
    duration_ms: input.durationMs,
    executed: input.executed ?? false,
  });
}

export function emitLiveRunNodeExecuted(
  runId: string,
  nodeId: string,
  nodeType: string,
  payload: unknown,
): void {
  emit("workflow.run.node.executed", {
    run_id: runId,
    node_id: nodeId,
    node_type: nodeType,
    payload,
  });
}

export function emitLiveRunPolicyDenied(runId: string, code: string, message: string): void {
  emit("workflow.run.policy.denied", { run_id: runId, code, message });
}

export function emitLiveRunComplete(input: {
  runId: string;
  status: "completed" | "failed" | "cancelled";
  summary: string;
  warnings: string[];
  nodesExecuted: number;
  executedActions: number;
}): void {
  emit("workflow.run.complete", {
    run_id: input.runId,
    status: input.status,
    summary: input.summary,
    warnings: input.warnings,
    nodes_executed: input.nodesExecuted,
    executed_actions: input.executedActions,
    simulated_actions: 0,
  });
}

export function emitLiveRunError(code: string, message: string, runId?: string): void {
  emit("workflow.run.error", { code, message, run_id: runId });
}

export function emitLiveRunKilled(runId: string, message: string): void {
  emit("workflow.run.killed", { run_id: runId, message });
}
