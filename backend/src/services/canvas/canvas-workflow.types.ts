import { z } from "zod";
import { canvasAgentLlmConfigSchema } from "./llm/canvas-llm.schema.js";
import { canvasGraphSchema } from "./graph/canvas-graph.schema.js";

export const createCanvasWorkflowSchema = z.object({
  name: z.string().min(1).max(256).optional(),
});

export const updateCanvasWorkflowSchema = z.object({
  name: z.string().min(1).max(256).optional(),
  graph: canvasGraphSchema.optional(),
});

export const patchCanvasBuildConfigSchema = canvasAgentLlmConfigSchema;

export const patchCanvasTesterConfigSchema = canvasAgentLlmConfigSchema;

export const canvasBuildStreamRequestSchema = z.object({
  message: z.string().min(1).max(16_000),
});

export const canvasDryRunStreamRequestSchema = z.object({
  message: z.string().max(16_000).optional(),
});

export type CreateCanvasWorkflowInput = z.infer<typeof createCanvasWorkflowSchema>;
export type UpdateCanvasWorkflowInput = z.infer<typeof updateCanvasWorkflowSchema>;
export type PatchCanvasBuildConfigInput = z.infer<typeof patchCanvasBuildConfigSchema>;
export type PatchCanvasTesterConfigInput = z.infer<typeof patchCanvasTesterConfigSchema>;
export type CanvasBuildStreamRequest = z.infer<typeof canvasBuildStreamRequestSchema>;
export type CanvasDryRunStreamRequest = z.infer<typeof canvasDryRunStreamRequestSchema>;

export type CanvasWorkflowListItem = {
  id: string;
  name: string;
  status: string;
  revision: number;
  updated_at: string;
};

export type CanvasWorkflowDetail = {
  id: string;
  name: string;
  status: string;
  schema_version: string;
  revision: number;
  graph: z.infer<typeof canvasGraphSchema>;
  build_config: z.infer<typeof canvasAgentLlmConfigSchema> | null;
  tester_config: z.infer<typeof canvasAgentLlmConfigSchema> | null;
  policy_id: string;
  created_at: string;
  updated_at: string;
};
