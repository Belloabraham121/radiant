import { runStubAgent } from "../stub-agent.js";
import type { AgentRuntime, AgentTurnInput, AgentTurnResult } from "./types.js";

export const stubRuntime: AgentRuntime = {
  id: "stub",

  async runTurn(input: AgentTurnInput): Promise<AgentTurnResult> {
    const lastUser =
      [...input.messages].reverse().find((message) => message.role === "user")?.content ?? "";

    const response = await runStubAgent(input.privyUserId, lastUser, input.sessionId);

    return {
      reply: response.reply,
      tool_calls: response.tool_calls,
      pending_transaction: response.pending_transaction,
    };
  },
};
