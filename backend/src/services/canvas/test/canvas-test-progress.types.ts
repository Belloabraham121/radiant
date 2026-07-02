import type { PolicyBindingWarning } from "../compiler/compiled-workflow.types.js";

/** Stable SSE event names for Canvas Dry Run / Tester streaming. */
export const CANVAS_DRY_RUN_PROGRESS_EVENT_NAMES = [
  "workflow.run.started",
  "workflow.run.node.start",
  "workflow.run.node.complete",
  "workflow.run.node.simulated",
  "workflow.run.policy.warning",
  "workflow.approve.pending",
  "workflow.run.complete",
  "workflow.run.error",
] as const;

export type CanvasDryRunProgressEventName =
  (typeof CANVAS_DRY_RUN_PROGRESS_EVENT_NAMES)[number];

export type WorkflowRunStartedEvent = {
  type: "workflow.run.started";
  run_id: string;
  workflow_id: string;
  mode: "dry";
  compiled_hash: string;
};

export type WorkflowRunNodeStartEvent = {
  type: "workflow.run.node.start";
  run_id: string;
  node_id: string;
  node_type: string;
};

export type WorkflowRunNodeCompleteEvent = {
  type: "workflow.run.node.complete";
  run_id: string;
  node_id: string;
  node_type: string;
  status: "ok" | "skipped" | "failed";
  detail?: string;
  duration_ms: number;
  simulated?: boolean;
};

export type WorkflowRunNodeSimulatedEvent = {
  type: "workflow.run.node.simulated";
  run_id: string;
  node_id: string;
  node_type: string;
  payload: unknown;
};

export type WorkflowRunPolicyWarningEvent = {
  type: "workflow.run.policy.warning";
  run_id: string;
  warnings: PolicyBindingWarning[];
};

export type WorkflowRunCompleteEvent = {
  type: "workflow.run.complete";
  run_id: string;
  status: "completed" | "failed";
  summary: string;
  warnings: string[];
  nodes_executed: number;
  simulated_actions: number;
};

export type WorkflowRunErrorEvent = {
  type: "workflow.run.error";
  run_id?: string;
  code: string;
  message: string;
};

export type WorkflowApprovePendingEvent = {
  type: "workflow.approve.pending";
  node_id: string;
  run_id: string;
  payload_preview: unknown;
};

export type CanvasDryRunProgressEvent =
  | WorkflowRunStartedEvent
  | WorkflowRunNodeStartEvent
  | WorkflowRunNodeCompleteEvent
  | WorkflowRunNodeSimulatedEvent
  | WorkflowRunPolicyWarningEvent
  | WorkflowApprovePendingEvent
  | WorkflowRunCompleteEvent
  | WorkflowRunErrorEvent;

export type CanvasDryRunProgressEventPayload = Omit<CanvasDryRunProgressEvent, "type">;

export type CanvasDryRunStreamSender = (
  event: CanvasDryRunProgressEventName,
  data: CanvasDryRunProgressEventPayload,
) => void;
