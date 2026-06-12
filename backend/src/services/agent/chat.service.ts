import { randomUUID } from "node:crypto";
import { getAnthropicConfig } from "../../config/agent.js";
import { AppError } from "../../errors/app-error.js";
import type { ChatRequest, ChatResponse } from "./agent.types.js";
import { runClaudeAgent } from "./claude-agent.js";
import { runStubAgent } from "./stub-agent.js";
import { approvePendingTransaction } from "./transaction-approval.service.js";

export async function handleChatMessage(
  privyUserId: string,
  request: ChatRequest,
): Promise<ChatResponse> {
  if (request.approve_transaction_id) {
    const approved = await approvePendingTransaction(
      privyUserId,
      request.approve_transaction_id,
    );

    if (!approved) {
      throw new AppError(
        404,
        "APPROVAL_NOT_FOUND",
        "Transaction approval expired or was not found.",
      );
    }

    return {
      reply: `Approved. Transaction submitted on ${approved.result.chain_id}. Digest: ${approved.result.digest}`,
      session_id: request.session_id ?? randomUUID(),
      mode: getAnthropicConfig().enabled ? "claude" : "stub",
      tool_calls: [
        {
          name: "execute_transaction",
          result: { status: "executed", result: approved.result },
        },
      ],
      pending_transaction: null,
    };
  }

  if (getAnthropicConfig().enabled) {
    try {
      return await runClaudeAgent(privyUserId, request.message, request.session_id);
    } catch {
      return runStubAgent(privyUserId, request.message, request.session_id);
    }
  }

  return runStubAgent(privyUserId, request.message, request.session_id);
}
