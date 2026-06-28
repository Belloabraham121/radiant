import { getDefaultAgentChainId } from "./chains.js";

function parsePositiveNumber(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const value = Number(raw);
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}

/** Default USD auto-approve threshold when user row is missing (deny defaults use 0). */
export function getDefaultAutoApproveMaxUsd(): number {
  return parsePositiveNumber("AGENT_AUTO_APPROVE_MAX_USD", 25);
}

export type AgentProvider = "openai" | "stub";

function parsePositiveInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const value = Number.parseInt(raw, 10);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

export function getOpenAiConfig() {
  const apiKey = process.env.OPENAI_API_KEY?.trim() || "";
  return {
    apiKey,
    enabled: apiKey.length > 0,
    model: process.env.OPENAI_MODEL?.trim() || "gpt-4o-mini",
    maxToolSteps: parsePositiveInt("OPENAI_MAX_TOOL_STEPS", 6),
    fallbackStub: process.env.AGENT_FALLBACK_STUB === "true",
    defaultChainId: getDefaultAgentChainId(),
  };
}

export function getAgentContextConfig() {
  return {
    maxMessages: parsePositiveInt("AGENT_MAX_CONTEXT_MESSAGES", 50),
    maxChars: parsePositiveInt("AGENT_MAX_CONTEXT_CHARS", 8000),
  };
}

/** Hard caps on LLM assistant output per reply and per turn (chars + tokens). */
export function getAgentOutputLimitsConfig() {
  return {
    maxOutputTokensChat: parsePositiveInt("AGENT_MAX_OUTPUT_TOKENS_CHAT", 4096),
    maxReplyChars: parsePositiveInt("AGENT_MAX_REPLY_CHARS", 12_000),
    maxTurnOutputChars: parsePositiveInt("AGENT_MAX_TURN_OUTPUT_CHARS", 32_000),
    maxToolArgsChars: parsePositiveInt("AGENT_MAX_TOOL_ARGS_CHARS", 524_288),
  };
}

/** Select production OpenAI runtime or local stub (default when no API key). */
export function getAgentProvider(): AgentProvider {
  const explicit = process.env.AGENT_PROVIDER?.trim().toLowerCase();
  if (explicit === "stub") return "stub";
  if (explicit === "openai") {
    return getOpenAiConfig().apiKey ? "openai" : "stub";
  }
  return getOpenAiConfig().apiKey ? "openai" : "stub";
}

export type PromptScopeMode = "full" | "scoped";

/** Agent prompt scope — default scoped (Phase 8). Override with PROMPT_SCOPE_MODE=full. */
export function getPromptScopeConfig(): {
  mode: PromptScopeMode;
  logMetrics: boolean;
} {
  const raw = process.env.PROMPT_SCOPE_MODE?.trim().toLowerCase();
  const mode: PromptScopeMode = raw === "full" ? "full" : "scoped";
  const logMetrics =
    process.env.NODE_ENV !== "test" &&
    (process.env.PROMPT_SCOPE_LOG === "true" ||
      (process.env.NODE_ENV === "development" && process.env.PROMPT_SCOPE_LOG !== "false"));
  return { mode, logMetrics };
}

export function getDefaultPromptScopeMode(): PromptScopeMode {
  return getPromptScopeConfig().mode;
}
