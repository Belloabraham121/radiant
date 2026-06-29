import { z } from "zod";
import { canvasAgentLlmConfigSchema } from "./llm/canvas-llm.schema.js";
import { canvasGraphSchema, canvasNodeTypeSchema } from "./graph/canvas-graph.schema.js";

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

export const canvasLiveStreamRequestSchema = z.object({
  confirm_live: z.boolean(),
});

export const patchCanvasPolicySchema = z.object({
  max_spend_usd_24h: z.number().positive().max(10_000_000).optional(),
  max_single_action_usd: z.number().positive().max(1_000_000).optional(),
  allowed_actions: z.array(canvasNodeTypeSchema).min(1).optional(),
  forbidden_transfers: z
    .array(
      z.object({
        from_chain: z.string().min(1).optional(),
        to_chain: z.string().min(1).optional(),
        token_symbol: z.string().min(1).optional(),
      }),
    )
    .optional(),
  region_profile: z.enum(["auto", "eu-west-2", "us-east-1"]).optional(),
  kill_switch: z.boolean().optional(),
  require_deploy_approval: z.boolean().optional(),
});

export type CreateCanvasWorkflowInput = z.infer<typeof createCanvasWorkflowSchema>;
export type UpdateCanvasWorkflowInput = z.infer<typeof updateCanvasWorkflowSchema>;
export type PatchCanvasBuildConfigInput = z.infer<typeof patchCanvasBuildConfigSchema>;
export type PatchCanvasTesterConfigInput = z.infer<typeof patchCanvasTesterConfigSchema>;
export type CanvasBuildStreamRequest = z.infer<typeof canvasBuildStreamRequestSchema>;
export type CanvasDryRunStreamRequest = z.infer<typeof canvasDryRunStreamRequestSchema>;
export type CanvasLiveStreamRequest = z.infer<typeof canvasLiveStreamRequestSchema>;
export type PatchCanvasPolicyInput = z.infer<typeof patchCanvasPolicySchema>;

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
