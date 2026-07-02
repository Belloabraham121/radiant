import { z } from "zod";
import {
  CANVAS_LLM_MODEL_TIERS,
  CANVAS_LLM_PROVIDER_IDS,
} from "./canvas-llm.types.js";

export const canvasAgentLlmConfigSchema = z.object({
  model_tier: z.enum(CANVAS_LLM_MODEL_TIERS),
  provider: z.enum(CANVAS_LLM_PROVIDER_IDS).optional(),
});

export const canvasLlmMessageSchema = z.object({
  role: z.enum(["system", "user", "assistant"]),
  content: z.string(),
});

export const canvasLlmCompletionParamsSchema = z.object({
  model: z.string().min(1),
  messages: z.array(canvasLlmMessageSchema).min(1),
  max_tokens: z.number().int().positive().optional(),
  temperature: z.number().min(0).max(2).optional(),
});
