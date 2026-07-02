export const CANVAS_LLM_MODEL_TIERS = ["lite", "thinking"] as const;

export type CanvasLlmModelTier = (typeof CANVAS_LLM_MODEL_TIERS)[number];

export const CANVAS_LLM_PROVIDER_IDS = ["openai"] as const;

export type CanvasLlmProviderId = (typeof CANVAS_LLM_PROVIDER_IDS)[number];

/** Builder / Tester agent LLM config — persisted on workflow document. */
export type CanvasAgentLlmConfig = {
  model_tier: CanvasLlmModelTier;
  provider?: CanvasLlmProviderId;
};

export type CanvasLlmMessageRole = "system" | "user" | "assistant";

export type CanvasLlmMessage = {
  role: CanvasLlmMessageRole;
  content: string;
};

export type CanvasLlmCompletionParams = {
  model: string;
  messages: CanvasLlmMessage[];
  max_tokens?: number;
  temperature?: number;
};

export type CanvasLlmChunk = {
  delta: string;
  done?: boolean;
};

export type CanvasLlmToolDefinition = {
  type: "function";
  function: {
    name: string;
    description?: string;
    parameters?: Record<string, unknown>;
  };
};

export type CanvasLlmToolCall = {
  id: string;
  name: string;
  arguments: string;
};

export type CanvasLlmToolCompletionResult = {
  content: string;
  tool_calls: CanvasLlmToolCall[];
};

export interface CanvasLlmProvider {
  id: CanvasLlmProviderId;
  resolveModel(tier: CanvasLlmModelTier): string;
  streamCompletion(
    params: CanvasLlmCompletionParams,
  ): AsyncIterable<CanvasLlmChunk>;
  complete(params: CanvasLlmCompletionParams): Promise<string>;
  completeWithTools(params: {
    model: string;
    messages: CanvasLlmMessage[];
    tools: CanvasLlmToolDefinition[];
    max_tokens?: number;
    temperature?: number;
  }): Promise<CanvasLlmToolCompletionResult>;
}
