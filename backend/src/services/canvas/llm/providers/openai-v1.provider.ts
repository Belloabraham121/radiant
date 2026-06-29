import { getOpenAiConfig } from "../../../../config/agent.js";
import type { CanvasLlmProvider } from "../canvas-llm.types.js";
import type { CanvasLlmChunk, CanvasLlmModelTier } from "../canvas-llm.types.js";

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

async function* emptyStream(): AsyncIterable<CanvasLlmChunk> {
  // Phase 0 skeleton — full OpenAI streaming wired in Phase 1+.
  yield { delta: "", done: true };
}

export const openAiV1CanvasLlmProvider: CanvasLlmProvider = {
  id: "openai",

  resolveModel(tier: CanvasLlmModelTier): string {
    return resolveOpenAiModel(tier);
  },

  streamCompletion(_params) {
    // TODO(Phase 1): integrate OpenAI streaming API (mirror chat runtime patterns).
    return emptyStream();
  },
};
