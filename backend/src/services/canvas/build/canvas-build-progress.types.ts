import type {
  CanvasEdge,
  CanvasNode,
} from "../graph/canvas-graph.types.js";

/** Stable SSE event names for Canvas Builder graph streaming. */
export const CANVAS_BUILD_PROGRESS_EVENT_NAMES = [
  "workflow.build.started",
  "workflow.build.status",
  "workflow.build.ack",
  "workflow.node.add",
  "workflow.node.update",
  "workflow.node.patch",
  "workflow.edge.add",
  "workflow.edge.remove",
  "workflow.node.focus",
  "workflow.build.complete",
  "workflow.approve.pending",
  "workflow.build.error",
] as const;

export type WorkflowBuildStatusKind =
  | "thinking"
  | "status"
  | "tool"
  | "warning"
  | "error"
  | "success";

export type WorkflowBuildStartedEvent = {
  type: "workflow.build.started";
  message: string;
};

export type WorkflowBuildStatusEvent = {
  type: "workflow.build.status";
  message: string;
  kind: WorkflowBuildStatusKind;
  tool?: string;
};

export type WorkflowBuildAckEvent = {
  type: "workflow.build.ack";
  message: string;
};

export type CanvasBuildProgressEventName =
  (typeof CANVAS_BUILD_PROGRESS_EVENT_NAMES)[number];

export type JsonPatchOperation = {
  op: "add" | "remove" | "replace" | "move" | "copy" | "test";
  path: string;
  value?: unknown;
  from?: string;
};

export type WorkflowNodeAddEvent = {
  type: "workflow.node.add";
  node: CanvasNode;
};

export type WorkflowNodeUpdateEvent = {
  type: "workflow.node.update";
  node_id: string;
  patch: Partial<CanvasNode>;
};

export type WorkflowNodePatchEvent = {
  type: "workflow.node.patch";
  node_id: string;
  json_patch: JsonPatchOperation[];
};

export type WorkflowEdgeAddEvent = {
  type: "workflow.edge.add";
  edge: CanvasEdge;
};

export type WorkflowEdgeRemoveEvent = {
  type: "workflow.edge.remove";
  edge_id: string;
};

export type WorkflowNodeFocusEvent = {
  type: "workflow.node.focus";
  node_id: string;
  reason?: string;
};

export type WorkflowBuildCompleteEvent = {
  type: "workflow.build.complete";
  revision: number;
  summary: string;
  warnings: string[];
};

export type WorkflowApprovePendingEvent = {
  type: "workflow.approve.pending";
  node_id: string;
  run_id: string;
  payload_preview: unknown;
};

export type WorkflowBuildErrorEvent = {
  type: "workflow.build.error";
  code: string;
  message: string;
};

export type CanvasBuildProgressEvent =
  | WorkflowBuildStartedEvent
  | WorkflowBuildStatusEvent
  | WorkflowBuildAckEvent
  | WorkflowNodeAddEvent
  | WorkflowNodeUpdateEvent
  | WorkflowNodePatchEvent
  | WorkflowEdgeAddEvent
  | WorkflowEdgeRemoveEvent
  | WorkflowNodeFocusEvent
  | WorkflowBuildCompleteEvent
  | WorkflowApprovePendingEvent
  | WorkflowBuildErrorEvent;

export type CanvasBuildProgressEventPayload = Omit<CanvasBuildProgressEvent, "type">;

export type CanvasBuildStreamSender = (
  event: CanvasBuildProgressEventName,
  data: CanvasBuildProgressEventPayload,
) => void;

export function canvasBuildEventType(
  event: CanvasBuildProgressEvent,
): CanvasBuildProgressEventName {
  return event.type;
}

export function canvasBuildEventPayload(
  event: CanvasBuildProgressEvent,
): CanvasBuildProgressEventPayload {
  const { type: _type, ...payload } = event;
  return payload;
}
