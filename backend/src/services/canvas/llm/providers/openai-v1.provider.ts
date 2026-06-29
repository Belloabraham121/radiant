import OpenAI from "openai";
import { getOpenAiConfig } from "../../../../config/agent.js";
import type {
  CanvasLlmCompletionParams,
  CanvasLlmProvider,
  CanvasLlmToolCall,
  CanvasLlmToolCompletionResult,
} from "../canvas-llm.types.js";
import type { CanvasLlmChunk, CanvasLlmModelTier } from "../canvas-llm.types.js";
import { streamChatCompletion } from "../../../agent/runtime/openai-stream-completion.js";

const DEFAULT_LITE_MODEL = "gpt-4o-mini";
const DEFAULT_THINKING_MODEL = "gpt-4o";

function resolveOpenAiModel(tier: CanvasLlmModelTier): string {
  const envLite = process.env.CANVAS_OPENAI_LITE_MODEL?.trim();
  const envThinking = process.env.CANVAS_OPENAI_THINKING_MODEL?.trim();
  const chatDefault = getOpenAiConfig().model;

  if (tier === "lite") {
    return envLite || chatDefault || DEFAULT_LITE_MODEL;
  }

  return envThinking || DEFAULT_THINKING_MODEL;
}

function getClient(): OpenAI {
  const { apiKey } = getOpenAiConfig();
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not configured");
  }
  return new OpenAI({ apiKey });
}

async function* streamTextCompletion(
  params: CanvasLlmCompletionParams,
): AsyncIterable<CanvasLlmChunk> {
  const client = getClient();
  const result = await streamChatCompletion(client, {
    model: params.model,
    messages: params.messages.map((m) => ({ role: m.role, content: m.content })),
    max_tokens: params.max_tokens,
    tools: [],
  });
  if (result.message.content) {
    yield { delta: result.message.content, done: false };
  }
  yield { delta: "", done: true };
}

export const openAiV1CanvasLlmProvider: CanvasLlmProvider = {
  id: "openai",

  resolveModel(tier: CanvasLlmModelTier): string {
    return resolveOpenAiModel(tier);
  },

  streamCompletion(params) {
    return streamTextCompletion(params);
  },

  async completeWithTools(params): Promise<CanvasLlmToolCompletionResult> {
    const client = getClient();
    const result = await streamChatCompletion(client, {
      model: params.model,
      messages: params.messages.map((m) => ({ role: m.role, content: m.content })),
      max_tokens: params.max_tokens,
      tools: params.tools as OpenAI.Chat.Completions.ChatCompletionTool[],
    });

    const toolCalls: CanvasLlmToolCall[] = [];
    for (const tc of result.message.tool_calls ?? []) {
      if (tc.type !== "function") continue;
      toolCalls.push({
        id: tc.id,
        name: tc.function.name,
        arguments: tc.function.arguments,
      });
    }

    return {
      content: result.message.content ?? "",
      tool_calls: toolCalls,
    };
  },
};
