import OpenAI from "openai";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { getOpenAiConfig } from "../../../config/agent.js";
import { AppError } from "../../../errors/app-error.js";
import type { ExecuteToolOutcome } from "../agent.types.js";
import {
  buildDepositExecuteNudge,
  extractDepositIntent,
  shouldNudgeDepositExecute,
} from "../deepbook/deposit-approval-flow.js";
import {
  buildWithdrawBalanceNudge,
  buildWithdrawExecuteNudge,
  extractWithdrawIntent,
  shouldNudgeWithdrawBalanceQuery,
  shouldNudgeWithdrawExecute,
} from "../deepbook/withdraw-approval-flow.js";
import {
  isCompoundMarketAndSwapRequest,
  POOL_INFO_BEFORE_SWAP_NUDGE,
  shouldFinalizeCompoundReply,
  shouldNudgePoolInfoBeforeSwap,
} from "../deepbook/compound-request-flow.js";
import {
  shouldNudgeSwapExecute,
  shouldNudgeSwapQuoteAndExecute,
  SWAP_EXECUTE_NUDGE,
  SWAP_QUOTE_AND_EXECUTE_NUDGE,
} from "../deepbook/swap-approval-flow.js";
import {
  findLatestFlashLoanQuote,
  filterToolCallsForClientDisplay,
  formatFlashLoanQuoteReply,
  isFlashLoanRepayNotFeasibleError,
  isInfeasibleFlashLoanQuoteResult,
  shouldFinalizeFlashLoanQuoteReply,
} from "../deepbook/flash-loan-approval-flow.js";
import {
  findLastToolError,
  hasSuccessfulQueryResults,
  REPLY_AFTER_TOOLS_NUDGE,
  shouldNudgeReplyAfterTools,
  hasAgentTransactionsQuery,
  AGENT_TRANSACTIONS_REPLY_NUDGE,
} from "../turn-reply-flow.js";
import {
  buildUnsupportedCapabilityNudge,
  detectUnsupportedCapability,
  isUnsupportedCapabilityNudge,
} from "../deepbook/unsupported-capabilities.js";
import { agentToolDefinitions, runAgentTool } from "../tools.js";
import { buildSystemPrompt } from "./prompts.js";
import { toOpenAiTools } from "./openai-tools.js";
import type { ExecuteTransactionInput } from "../../chains/types.js";
import {
  explainTransactionError,
  isAgentToolErrorResult,
  synthesizeTurnReply,
} from "./error-explanation.js";
import { EXECUTE_TRANSACTION_TOOL_NAME } from "../execute-transaction.tool.js";
import { QUERY_CHAIN_TOOL_NAME } from "../query-chain.tool.js";
import type { FlashLoanBundleQuoteResult } from "../../defi/deepbook/deepbook-flash-loan.types.js";
import { transactionContextFromInput } from "../deepbook/transaction-error-context.js";
import { summarizeToolResult } from "./summarize-tool-result.js";
import type { AgentRuntime, AgentTurnInput, AgentTurnResult } from "./types.js";
import type { AgentToolErrorResult } from "../tools.js";

function mapOpenAiError(err: unknown): AppError {
  if (err instanceof OpenAI.APIError) {
    if (err.status === 401) {
      return new AppError(502, "OPENAI_AUTH_ERROR", "OpenAI API authentication failed.");
    }
    if (err.status === 429) {
      return new AppError(
        503,
        "OPENAI_RATE_LIMIT",
        "OpenAI rate limit exceeded. Try again shortly.",
      );
    }
    return new AppError(
      502,
      "OPENAI_ERROR",
      `OpenAI API error (${err.status}): ${err.message}`.slice(0, 500),
    );
  }

  if (err instanceof AppError) {
    return err;
  }

  return new AppError(500, "OPENAI_UNEXPECTED", "Unexpected OpenAI client error.");
}

export const openaiRuntime: AgentRuntime = {
  id: "openai",

  async runTurn(input: AgentTurnInput): Promise<AgentTurnResult> {
    const { apiKey, model, maxToolSteps } = getOpenAiConfig();
    if (!apiKey) {
      throw new AppError(503, "OPENAI_NOT_CONFIGURED", "OPENAI_API_KEY is not set");
    }

    const client = new OpenAI({ apiKey });
    const tools = toOpenAiTools(agentToolDefinitions);

    const messages: ChatCompletionMessageParam[] = [
      {
        role: "system",
        content: buildSystemPrompt({
          memoryBlock: input.memoryBlock,
          agentPermissions: input.agentPermissions,
        }),
      },
      ...input.messages.map((message) => ({
        role: message.role,
        content: message.content,
      })),
    ];

    const tool_calls: AgentTurnResult["tool_calls"] = [];
    let pending_transaction: AgentTurnResult["pending_transaction"] = null;
    let reply = "";
    let lastExecuteInput: ExecuteTransactionInput | null = null;
    const lastUserMessage =
      [...input.messages].reverse().find((message) => message.role === "user")?.content ?? "";

    for (let step = 0; step < maxToolSteps; step += 1) {
      let completion;
      try {
        completion = await client.chat.completions.create({
          model,
          messages,
          tools,
          tool_choice: "auto",
          max_tokens: 1024,
        });
      } catch (err) {
        throw mapOpenAiError(err);
      }

      const choice = completion.choices[0]?.message;
      if (!choice) {
        throw new AppError(502, "OPENAI_EMPTY_RESPONSE", "OpenAI returned no completion choice.");
      }

      const toolCallList = choice.tool_calls ?? [];
      if (toolCallList.length === 0) {
        const unsupported = detectUnsupportedCapability(lastUserMessage);
        const lastUserContent =
          messages.length > 0 ? messages[messages.length - 1]?.content : undefined;
        const lastContentStr =
          typeof lastUserContent === "string" ? lastUserContent : "";

        if (
          unsupported &&
          !isUnsupportedCapabilityNudge(lastContentStr)
        ) {
          messages.push({
            role: "user",
            content: buildUnsupportedCapabilityNudge(unsupported),
          });
          continue;
        }

        if (shouldNudgePoolInfoBeforeSwap(tool_calls, lastUserMessage)) {
          messages.push({
            role: "user",
            content: POOL_INFO_BEFORE_SWAP_NUDGE,
          });
          continue;
        }

        if (shouldNudgeSwapExecute(tool_calls, lastUserMessage)) {
          messages.push({
            role: "user",
            content: SWAP_EXECUTE_NUDGE,
          });
          continue;
        }

        if (shouldNudgeSwapQuoteAndExecute(tool_calls, lastUserMessage)) {
          messages.push({
            role: "user",
            content: SWAP_QUOTE_AND_EXECUTE_NUDGE,
          });
          continue;
        }

        if (shouldNudgeWithdrawBalanceQuery(tool_calls, lastUserMessage)) {
          const intent = extractWithdrawIntent(lastUserMessage)!;
          messages.push({
            role: "user",
            content: buildWithdrawBalanceNudge(intent.coin_key),
          });
          continue;
        }

        if (shouldNudgeWithdrawExecute(tool_calls, lastUserMessage)) {
          const intent = extractWithdrawIntent(lastUserMessage)!;
          messages.push({
            role: "user",
            content: buildWithdrawExecuteNudge(intent),
          });
          continue;
        }

        if (shouldNudgeDepositExecute(tool_calls, lastUserMessage)) {
          const intent = extractDepositIntent(lastUserMessage)!;
          messages.push({
            role: "user",
            content: buildDepositExecuteNudge(intent),
          });
          continue;
        }

        if (shouldNudgeReplyAfterTools(tool_calls)) {
          messages.push({
            role: "user",
            content: hasAgentTransactionsQuery(tool_calls)
              ? `${REPLY_AFTER_TOOLS_NUDGE}\n\n${AGENT_TRANSACTIONS_REPLY_NUDGE}`
              : REPLY_AFTER_TOOLS_NUDGE,
          });
          continue;
        }

        reply = choice.content?.trim() || "Done.";
        break;
      }

      messages.push(choice);

      let executeToolError: AgentToolErrorResult | null = null;
      let infeasibleFlashLoanQuote: FlashLoanBundleQuoteResult | null = null;

      for (const toolCall of toolCallList) {
        if (toolCall.type !== "function") continue;

        let args: Record<string, unknown>;
        try {
          args = JSON.parse(toolCall.function.arguments) as Record<string, unknown>;
        } catch {
          args = {};
        }

        const result = await runAgentTool(input.privyUserId, toolCall.function.name, args, {
          sessionId: input.sessionId,
        });
        tool_calls.push({ name: toolCall.function.name, result });

        if (
          toolCall.function.name === QUERY_CHAIN_TOOL_NAME &&
          isInfeasibleFlashLoanQuoteResult(result)
        ) {
          infeasibleFlashLoanQuote = result satisfies FlashLoanBundleQuoteResult;
        }

        if (toolCall.function.name === EXECUTE_TRANSACTION_TOOL_NAME) {
          lastExecuteInput = args as ExecuteTransactionInput;
        }

        if (
          toolCall.function.name === EXECUTE_TRANSACTION_TOOL_NAME &&
          isAgentToolErrorResult(result)
        ) {
          executeToolError = result;
        }

        if (toolCall.function.name === "execute_transaction") {
          const outcome = result as ExecuteToolOutcome;
          if (
            typeof outcome === "object" &&
            outcome !== null &&
            outcome.status === "approval_required"
          ) {
            pending_transaction = outcome.pending;
          }
        }

        messages.push({
          role: "tool",
          tool_call_id: toolCall.id,
          content: summarizeToolResult(toolCall.function.name, result),
        });

        if (infeasibleFlashLoanQuote && !pending_transaction) {
          break;
        }
      }

      if (infeasibleFlashLoanQuote && !pending_transaction) {
        reply = formatFlashLoanQuoteReply(infeasibleFlashLoanQuote);
        break;
      }

      if (pending_transaction) {
        reply =
          "This transaction needs your approval before I can broadcast it. Review the quote and confirm in the dialog.";
        break;
      }

      const flashLoanQuoteReply = shouldFinalizeFlashLoanQuoteReply(
        tool_calls,
        pending_transaction !== null,
      );
      if (flashLoanQuoteReply) {
        reply = formatFlashLoanQuoteReply(flashLoanQuoteReply);
        break;
      }

      if (executeToolError) {
        const compoundReply = shouldFinalizeCompoundReply(
          tool_calls,
          lastUserMessage,
          executeToolError,
        );

        if (executeToolError.error.code === "VALIDATION_ERROR" && !compoundReply) {
          const quote = findLatestFlashLoanQuote(tool_calls);
          if (
            quote &&
            (!quote.repay_feasible ||
              isFlashLoanRepayNotFeasibleError(executeToolError.error.message))
          ) {
            reply = formatFlashLoanQuoteReply(quote);
            break;
          }
          continue;
        }

        try {
          reply = await explainTransactionError({
            client,
            model,
            messages,
            toolName: EXECUTE_TRANSACTION_TOOL_NAME,
            toolResult: executeToolError,
            transactionContext: transactionContextFromInput(lastExecuteInput),
            compoundRequest:
              compoundReply || isCompoundMarketAndSwapRequest(lastUserMessage),
          });
        } catch (err) {
          throw mapOpenAiError(err);
        }
        break;
      }
    }

    if (!reply) {
      const quote = findLatestFlashLoanQuote(tool_calls);
      if (quote) {
        reply = formatFlashLoanQuoteReply(quote);
      } else {
        const lastToolError = findLastToolError(tool_calls);
        if (lastToolError) {
          try {
            reply = await explainTransactionError({
              client,
              model,
              messages,
              toolName: lastToolError.name,
              toolResult: lastToolError.result,
              transactionContext: transactionContextFromInput(lastExecuteInput),
            });
          } catch (err) {
            throw mapOpenAiError(err);
          }
        } else if (hasSuccessfulQueryResults(tool_calls)) {
          try {
            reply = await synthesizeTurnReply({ client, model, messages });
          } catch (err) {
            throw mapOpenAiError(err);
          }
        } else {
          reply = "I processed your request.";
        }
      }
    }

    return {
      reply,
      tool_calls: filterToolCallsForClientDisplay(tool_calls),
      pending_transaction,
    };
  },
};
