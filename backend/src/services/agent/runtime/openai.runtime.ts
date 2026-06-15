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
  filterToolCallsForClientDisplay,
  formatFlashLoanQuoteReply,
  findLatestFlashLoanQuote,
  buildInfeasibleFlashLoanExecuteBlock,
  buildFlashLoanResearchExecuteBlock,
  hasFlashLoanExecutionAttempt,
  isFlashLoanRepayInfeasibleErrorCode,
  isFlashLoanToolValidationError,
  isInfeasibleFlashLoanQuoteResult,
  shouldFinalizeFlashLoanQuoteReply,
  shouldUseCannedFlashLoanQuoteReply,
} from "../deepbook/flash-loan-approval-flow.js";
import { classifyFlashLoanTurnIntent } from "../deepbook/flash-loan-turn-intent.js";
import {
  buildReplyAfterToolsNudge,
  findLastToolError,
  hasSuccessfulQueryResults,
  shouldNudgeReplyAfterTools,
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
import { CALL_APP_ACTION_TOOL_NAME } from "../../projects/call-app-action.tool.js";
import { QUERY_CHAIN_TOOL_NAME } from "../query-chain.tool.js";
import type { AppActionResult } from "../../projects/app-action.types.js";
import type { FlashLoanBundleQuoteResult } from "../../defi/deepbook/deepbook-flash-loan.types.js";
import { emitArtifactPreview, emitExecutionProgress, emitReplyClear, emitReplyDelta, hasExecutionProgressContext } from "../execution-progress-context.js";
import { GENERATE_APP_TOOL_NAME } from "../../projects/generate-app.tool.js";
import { parsePartialGenerateAppArgs } from "../../projects/parse-partial-generate-app.js";
import { buildPreviewArtifactPayload } from "../../projects/preview-artifact.js";
import type { GenerateAppResult } from "../../projects/project.types.js";
import { streamChatCompletion } from "./openai-stream-completion.js";
import { openAiMaxOutputTokens } from "./openai-completion-params.js";
import type { DeepBookSwapQuoteResult } from "../../defi/deepbook/deepbook-swap.service.js";
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

function emitExecuteProgressFromResult(
  result: unknown,
  toolInput: Pick<{ action?: string; query?: string }, "action" | "query">,
): void {
  if (isAgentToolErrorResult(result)) {
    const message = result.error.message;
    if (isFlashLoanToolValidationError(EXECUTE_TRANSACTION_TOOL_NAME, toolInput, result.error.code)) {
      emitExecutionProgress({
        step: {
          id: "quote",
          status: "failed",
          label: "Quote flash loan",
          detail: message,
        },
      });
      emitExecutionProgress({
        step: {
          id: "execute",
          status: "skipped",
          label: "Execute bundle",
          detail: "Blocked — fix the flash loan route before executing",
        },
      });
      return;
    }

    emitExecutionProgress({
      step: {
        id: "execute",
        status: "failed",
        label: "Execute bundle",
        detail: message,
      },
    });
    return;
  }

  const outcome = result as ExecuteToolOutcome;
  if (outcome.status === "approval_required") {
    emitExecutionProgress({
      step: {
        id: "execute",
        status: "warning",
        label: "Execute bundle",
        detail: "Waiting for your approval in the dialog",
        agent_transaction_id: outcome.pending?.id,
        chain_id: outcome.pending?.chain_id,
      },
    });
    return;
  }

  if (outcome.status === "executed" && outcome.result?.digest) {
    emitExecutionProgress({
      step: {
        id: "execute",
        status: "ok",
        label: "Execute bundle",
        detail: `Broadcast · ${outcome.result.digest.slice(0, 10)}…`,
        digest: outcome.result.digest,
        chain_id: outcome.result.chain_id,
        agent_transaction_id: outcome.agent_transaction_id,
      },
    });
  }
}

function emitSwapQuoteProgressFromResult(result: unknown): void {
  if (isAgentToolErrorResult(result)) {
    emitExecutionProgress({
      step: {
        id: "swap-quote",
        status: "failed",
        label: "Swap quote",
        detail: result.error.message,
      },
    });
    return;
  }

  const quote = result as DeepBookSwapQuoteResult;
  if (quote.input_coin && quote.output_amount_display != null) {
    emitExecutionProgress({
      step: {
        id: "swap-quote",
        status: "ok",
        label: "Swap quote",
        detail: `${quote.input_amount_display} ${quote.input_coin} → ~${quote.output_amount_display} ${quote.output_coin}${quote.pool_key ? ` (${quote.pool_key})` : ""}`,
      },
    });
  }
}

function emitQueryChainFailureProgress(
  query: unknown,
  result: AgentToolErrorResult,
): void {
  const message = result.error.message;

  if (query === "flash_loan_quote") {
    emitExecutionProgress({
      step: {
        id: "quote",
        status: "failed",
        label: "Quote flash loan",
        detail: message,
      },
    });
    return;
  }

  emitExecutionProgress({
    step: {
      id: `query-${String(query ?? "chain")}`,
      status: "failed",
      label: "Query failed",
      detail: message,
    },
  });
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
          pinnedAppScope: input.pinnedAppScope,
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
    let streamedReplyAccum = "";
    let lastExecuteInput: ExecuteTransactionInput | null = null;
    const lastUserMessage =
      [...input.messages].reverse().find((message) => message.role === "user")?.content ?? "";
    const flashLoanTurnIntent = classifyFlashLoanTurnIntent(lastUserMessage);

    let streamingArtifactPreview: import("../../projects/project.types.js").ArtifactPayload | null =
      null;
    let lastStreamedGenerateAppArgsLength = 0;

    const emitGenerateAppPreview = (rawArgs: string, streaming = true) => {
      const partial = parsePartialGenerateAppArgs(rawArgs);
      const preview = buildPreviewArtifactPayload(partial, streamingArtifactPreview);
      if (!preview) return;
      streamingArtifactPreview = preview;
      emitArtifactPreview(preview, streaming);
    };

    for (let step = 0; step < maxToolSteps; step += 1) {
      let choice;
      let streamedReplyText = false;
      streamedReplyAccum = "";
      try {
        if (hasExecutionProgressContext()) {
          choice = await streamChatCompletion(client, {
            model,
            messages,
            tools,
            max_tokens: 4096,
          }, {
            onContentDelta: (delta) => {
              streamedReplyText = true;
              streamedReplyAccum += delta;
              emitReplyDelta(delta);
            },
            onToolCallDelta: (toolCall) => {
              if (toolCall.name !== GENERATE_APP_TOOL_NAME) return;
              if (lastStreamedGenerateAppArgsLength === 0) {
                emitExecutionProgress({
                  step: {
                    id: "generate-app",
                    status: "running",
                    label: "Building app",
                    detail: "Writing source files…",
                  },
                });
              }
              if (toolCall.arguments.length <= lastStreamedGenerateAppArgsLength) return;
              if (toolCall.arguments.length - lastStreamedGenerateAppArgsLength < 24) return;
              lastStreamedGenerateAppArgsLength = toolCall.arguments.length;
              emitGenerateAppPreview(toolCall.arguments, true);
            },
          });
        } else {
          const completion = await client.chat.completions.create({
            model,
            messages,
            tools,
            tool_choice: "auto",
            ...openAiMaxOutputTokens(model, 4096),
          });
          choice = completion.choices[0]?.message;
          if (!choice) {
            throw new AppError(502, "OPENAI_EMPTY_RESPONSE", "OpenAI returned no completion choice.");
          }
        }
      } catch (err) {
        throw mapOpenAiError(err);
      }

      if (!choice) {
        throw new AppError(502, "OPENAI_EMPTY_RESPONSE", "OpenAI returned no completion choice.");
      }

      const toolCallList = choice.tool_calls ?? [];
      if (toolCallList.length > 0 && streamedReplyText) {
        emitReplyClear();
        streamedReplyAccum = "";
      }
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

        if (shouldNudgeReplyAfterTools(tool_calls, choice.content)) {
          messages.push({
            role: "user",
            content: buildReplyAfterToolsNudge(tool_calls),
          });
          continue;
        }

        reply = choice.content?.trim() || streamedReplyAccum.trim() || "Done.";
        break;
      }

      messages.push(choice);

      const batchHasExecute = toolCallList.some(
        (toolCall) =>
          toolCall.type === "function" &&
          toolCall.function.name === EXECUTE_TRANSACTION_TOOL_NAME,
      );
      const flashLoanExecutionUi =
        flashLoanTurnIntent !== "research" && batchHasExecute;

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

        if (toolCall.function.name === GENERATE_APP_TOOL_NAME) {
          emitExecutionProgress({
            step: {
              id: "generate-app",
              status: "running",
              label: "Building app",
              detail: "Writing source files…",
            },
          });
          emitGenerateAppPreview(toolCall.function.arguments, true);
        }

        if (toolCall.function.name === EXECUTE_TRANSACTION_TOOL_NAME) {
          const priorInfeasibleQuote = findLatestFlashLoanQuote(tool_calls);
          const blockInfeasibleExecute =
            args.action === "deepbook_flash_loan" &&
            priorInfeasibleQuote !== null &&
            !priorInfeasibleQuote.repay_feasible;
          const blockResearchExecute =
            args.action === "deepbook_flash_loan" && flashLoanTurnIntent === "research";

          if (!blockInfeasibleExecute && !blockResearchExecute) {
            emitExecutionProgress({
              step: {
                id: "execute",
                status: "running",
                label: "Execute bundle",
                detail: "Validating and preparing transaction…",
              },
            });
          }
        }

        if (
          flashLoanExecutionUi &&
          toolCall.function.name === QUERY_CHAIN_TOOL_NAME &&
          args.query === "flash_loan_quote"
        ) {
          emitExecutionProgress({
            step: {
              id: "quote",
              status: "running",
              label: "Quote flash loan",
              detail: "Validating route and fetching pool prices…",
            },
          });
        }

        if (
          batchHasExecute &&
          toolCall.function.name === QUERY_CHAIN_TOOL_NAME &&
          args.query === "swap_quote"
        ) {
          emitExecutionProgress({
            step: {
              id: "swap-quote",
              status: "running",
              label: "Swap quote",
              detail: "Fetching pool price…",
            },
          });
        }

        const priorInfeasibleQuote = findLatestFlashLoanQuote(tool_calls);
        const blockInfeasibleFlashLoanExecute =
          toolCall.function.name === EXECUTE_TRANSACTION_TOOL_NAME &&
          args.action === "deepbook_flash_loan" &&
          priorInfeasibleQuote !== null &&
          !priorInfeasibleQuote.repay_feasible;
        const blockResearchFlashLoanExecute =
          toolCall.function.name === EXECUTE_TRANSACTION_TOOL_NAME &&
          args.action === "deepbook_flash_loan" &&
          flashLoanTurnIntent === "research";

        const result = blockInfeasibleFlashLoanExecute
          ? buildInfeasibleFlashLoanExecuteBlock(priorInfeasibleQuote)
          : blockResearchFlashLoanExecute
            ? buildFlashLoanResearchExecuteBlock()
          : await runAgentTool(input.privyUserId, toolCall.function.name, args, {
              sessionId: input.sessionId,
              flashLoanTurnIntent,
              pinnedAppScope: input.pinnedAppScope,
              ...(toolCall.function.name === GENERATE_APP_TOOL_NAME
                ? { rawArguments: toolCall.function.arguments }
                : {}),
            });
        tool_calls.push({
          name: toolCall.function.name,
          ...(toolCall.function.name === QUERY_CHAIN_TOOL_NAME && typeof args.query === "string"
            ? { query: args.query }
            : {}),
          ...(toolCall.function.name === EXECUTE_TRANSACTION_TOOL_NAME &&
          typeof args.action === "string"
            ? { action: args.action }
            : {}),
          ...(toolCall.function.name === CALL_APP_ACTION_TOOL_NAME &&
          typeof args.action === "string"
            ? { action: args.action }
            : {}),
          result,
        });

        if (toolCall.function.name === GENERATE_APP_TOOL_NAME) {
          if (!isAgentToolErrorResult(result)) {
            const appResult = result as GenerateAppResult;
            if (appResult.artifact) {
              streamingArtifactPreview = appResult.artifact;
              emitArtifactPreview(appResult.artifact, false);
            }
            emitExecutionProgress({
              step: {
                id: "generate-app",
                status: "ok",
                label: "Building app",
                detail: `${appResult.files.length} file${appResult.files.length === 1 ? "" : "s"} updated`,
              },
            });
          } else {
            if (streamingArtifactPreview) {
              emitArtifactPreview(streamingArtifactPreview, false);
            }
            emitExecutionProgress({
              step: {
                id: "generate-app",
                status: "failed",
                label: "Building app",
                detail: result.error.message,
              },
            });
          }
        }

        if (
          toolCall.function.name === EXECUTE_TRANSACTION_TOOL_NAME &&
          !blockInfeasibleFlashLoanExecute &&
          !blockResearchFlashLoanExecute
        ) {
          emitExecuteProgressFromResult(result, {
            action: typeof args.action === "string" ? args.action : undefined,
          });
        }

        if (
          batchHasExecute &&
          toolCall.function.name === QUERY_CHAIN_TOOL_NAME &&
          args.query === "swap_quote"
        ) {
          emitSwapQuoteProgressFromResult(result);
        }

        if (
          toolCall.function.name === QUERY_CHAIN_TOOL_NAME &&
          isAgentToolErrorResult(result)
        ) {
          if (flashLoanExecutionUi && args.query === "flash_loan_quote") {
            emitQueryChainFailureProgress(args.query, result);
          } else if (args.query !== "flash_loan_quote") {
            emitQueryChainFailureProgress(args.query, result);
          }
        }

        if (
          toolCall.function.name === QUERY_CHAIN_TOOL_NAME &&
          isInfeasibleFlashLoanQuoteResult(result)
        ) {
          infeasibleFlashLoanQuote = result;
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

        if (toolCall.function.name === CALL_APP_ACTION_TOOL_NAME) {
          const outcome = result as AppActionResult;
          if (outcome.status === "approval_required") {
            pending_transaction = outcome.pending;
          }
        }

        messages.push({
          role: "tool",
          tool_call_id: toolCall.id,
          content: summarizeToolResult(toolCall.function.name, result),
        });

        if (infeasibleFlashLoanQuote && !pending_transaction && hasFlashLoanExecutionAttempt(tool_calls)) {
          break;
        }
      }

      if (
        infeasibleFlashLoanQuote &&
        !pending_transaction &&
        hasFlashLoanExecutionAttempt(tool_calls)
      ) {
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
          if (quote && !quote.repay_feasible) {
            reply = formatFlashLoanQuoteReply(quote);
            break;
          }
          continue;
        }

        if (
          isFlashLoanRepayInfeasibleErrorCode(executeToolError.error.code) &&
          !compoundReply
        ) {
          const quote = findLatestFlashLoanQuote(tool_calls);
          if (quote) {
            reply = formatFlashLoanQuoteReply(quote);
            break;
          }
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
      if (quote && shouldUseCannedFlashLoanQuoteReply(tool_calls, quote)) {
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
          const streamed = streamedReplyAccum.trim();
          if (streamed) {
            reply = streamed;
          } else {
            try {
              reply = await synthesizeTurnReply({ client, model, messages });
            } catch (err) {
              throw mapOpenAiError(err);
            }
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
