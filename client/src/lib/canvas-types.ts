export const CANVAS_LLM_MODEL_TIERS = ["lite", "thinking"] as const;

export type CanvasLlmModelTier = (typeof CANVAS_LLM_MODEL_TIERS)[number];

export type CanvasBuildProgressEventName =
  | "workflow.node.add"
  | "workflow.node.update"
  | "workflow.node.patch"
  | "workflow.edge.add"
  | "workflow.edge.remove"
  | "workflow.node.focus"
  | "workflow.build.complete"
  | "workflow.build.error";
