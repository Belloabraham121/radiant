import { getAgentProvider } from "../../../config/agent.js";
import { openaiRuntime } from "./openai.runtime.js";
import { stubRuntime } from "./stub.runtime.js";
import type { AgentRuntime } from "./types.js";

export function getAgentRuntime(): AgentRuntime {
  return getAgentProvider() === "openai" ? openaiRuntime : stubRuntime;
}

export type {
  AgentRuntime,
  AgentRuntimeId,
  AgentTurnInput,
  AgentTurnMessage,
  AgentTurnResult,
} from "./types.js";
