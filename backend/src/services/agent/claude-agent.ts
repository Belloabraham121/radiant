import { randomUUID } from "node:crypto";
import { getAnthropicConfig } from "../../config/agent.js";
import { getDefaultAgentChainId } from "../../config/chains.js";
import { AppError } from "../../errors/app-error.js";
import type { ChatResponse, ExecuteToolOutcome, ToolCallRecord } from "./agent.types.js";
import { agentToolDefinitions } from "./tools.js";
import { runAgentTool } from "./tools.js";
import type { BalanceResult } from "../chains/types.js";
import { approvalThresholdLabel } from "./transaction-approval.service.js";

type AnthropicTextBlock = { type: "text"; text: string };
type AnthropicToolUseBlock = {
  type: "tool_use";
  id: string;
  name: string;
  input: Record<string, unknown>;
};
type AnthropicToolResultBlock = {
  type: "tool_result";
  tool_use_id: string;
  content: string;
};

type AnthropicContentBlock = AnthropicTextBlock | AnthropicToolUseBlock;

type AnthropicMessage = {
  role: "user" | "assistant";
  content: string | AnthropicContentBlock[] | AnthropicToolResultBlock[];
};

function systemPrompt(): string {
  const chainId = getDefaultAgentChainId();
  return (
    "You are Radiant, a personal onchain agent. " +
    "The user's agent wallet is resolved from their authenticated session — never ask for or accept wallet addresses in tool inputs unless required as a transfer recipient. " +
    `Default chain: ${chainId}. ` +
    `Auto-approve transfers up to ${approvalThresholdLabel(chainId)}; larger transfers require user approval in the app. ` +
    "Use query_chain for balances and execute_transaction for transfers."
  );
}

function extractText(blocks: AnthropicContentBlock[]): string {
  return blocks
    .filter((b): b is { type: "text"; text: string } => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();
}

function summarizeToolResult(name: string, result: unknown): string {
  if (name === "query_chain") {
    const balance = result as BalanceResult;
    return `Balance: ${balance.balance_display} ${balance.native_symbol}`;
  }
  const outcome = result as ExecuteToolOutcome;
  if (outcome.status === "approval_required") {
    return `Approval required: ${outcome.pending.summary}`;
  }
  return `Tx digest: ${outcome.result.digest}`;
}

export async function runClaudeAgent(
  privyUserId: string,
  message: string,
  sessionId?: string,
): Promise<ChatResponse> {
  const { apiKey, model } = getAnthropicConfig();
  if (!apiKey) {
    throw new AppError(503, "ANTHROPIC_NOT_CONFIGURED", "ANTHROPIC_API_KEY is not set");
  }

  const messages: AnthropicMessage[] = [{ role: "user", content: message }];
  const tool_calls: ToolCallRecord[] = [];
  let pending_transaction: ChatResponse["pending_transaction"] = null;
  let reply = "";

  for (let step = 0; step < 4; step += 1) {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model,
        max_tokens: 1024,
        system: systemPrompt(),
        tools: agentToolDefinitions,
        messages,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new AppError(
        502,
        "ANTHROPIC_ERROR",
        `Anthropic API error (${response.status}): ${errText.slice(0, 200)}`,
      );
    }

    const body = (await response.json()) as {
      content: AnthropicContentBlock[];
      stop_reason: string;
    };

    const toolUses = body.content.filter(
      (block): block is Extract<AnthropicContentBlock, { type: "tool_use" }> =>
        block.type === "tool_use",
    );

    if (toolUses.length === 0) {
      reply = extractText(body.content) || "Done.";
      break;
    }

    messages.push({ role: "assistant", content: body.content });

    const toolResults: AnthropicToolResultBlock[] = [];

    for (const toolUse of toolUses) {
      const result = await runAgentTool(privyUserId, toolUse.name, toolUse.input);
      tool_calls.push({ name: toolUse.name, result });

      if (toolUse.name === "execute_transaction") {
        const outcome = result as ExecuteToolOutcome;
        if (outcome.status === "approval_required") {
          pending_transaction = outcome.pending;
        }
      }

      toolResults.push({
        type: "tool_result",
        tool_use_id: toolUse.id,
        content: summarizeToolResult(toolUse.name, result),
      });
    }

    messages.push({
      role: "user",
      content: toolResults,
    });

    if (pending_transaction) {
      reply =
        "This transfer needs your approval before I can broadcast it. Review the amount and confirm in the dialog.";
      break;
    }

    if (body.stop_reason === "end_turn") {
      reply = extractText(body.content);
      break;
    }
  }

  if (!reply) {
    reply = "I processed your request.";
  }

  return {
    reply,
    session_id: sessionId ?? randomUUID(),
    mode: "claude",
    tool_calls,
    pending_transaction,
  };
}
