import type { ExecuteTransactionInput } from "../../chains/types.js";
import { getDeepBookSwapQuote } from "../../defi/deepbook/deepbook-swap.service.js";
import { AppError } from "../../../errors/app-error.js";
import { mapAgentToolError } from "../../../utils/agent-tool-errors.js";
import type { ExecuteToolOutcome, PendingTransaction, ToolCallRecord } from "../agent.types.js";
import { isCompoundMarketAndSwapRequest } from "./compound-request-flow.js";
import { parseSwapExecutionIntent } from "../execution-intent.js";
import { EXECUTE_TRANSACTION_TOOL_NAME } from "../execute-transaction.tool.js";
import { QUERY_CHAIN_TOOL_NAME } from "../query-chain.tool.js";
import { runExecuteTransactionToolWithApproval } from "../tools.js";
import { looksLikeWorkflowMessage } from "../workflow/heuristic-planner.js";

export type SingleSwapOutcome = {
  reply: string;
  tool_calls: ToolCallRecord[];
  pending_transaction: PendingTransaction | null;
};

const APPROVAL_REPLY =
  "This transaction needs your approval before I can broadcast it. Review the quote and confirm in the dialog.";

export async function tryExecuteSingleSwapFromMessage(
  privyUserId: string,
  message: string,
  sessionId?: string,
): Promise<SingleSwapOutcome | null> {
  if (looksLikeWorkflowMessage(message)) {
    return null;
  }
  if (isCompoundMarketAndSwapRequest(message)) {
    return null;
  }

  const intent = parseSwapExecutionIntent(message);
  if (!intent) {
    return null;
  }

  const executeInput = intent.execute.input as ExecuteTransactionInput;
  const params = { ...executeInput.params } as Record<string, unknown>;

  let quote;
  try {
    quote = await getDeepBookSwapQuote(privyUserId, params);
  } catch (err) {
    const mapped = mapAgentToolError(err);
    return {
      reply:
        mapped instanceof AppError
          ? mapped.message
          : "Could not quote this swap — check the pool and amount, then try again.",
      tool_calls: [
        {
          name: QUERY_CHAIN_TOOL_NAME,
          query: "swap_quote",
          result: {
            error: {
              code: mapped instanceof AppError ? mapped.code : "SWAP_QUOTE_FAILED",
              message: mapped instanceof AppError ? mapped.message : String(mapped),
            },
          },
        },
      ],
      pending_transaction: null,
    };
  }

  params.estimated_out_display = quote.output_amount_display;
  params.min_out_display = quote.min_out_display;
  params.input_coin = quote.input_coin;
  params.output_coin = quote.output_coin;
  params.quote_expires_at = quote.expires_at;
  params.quoted_at = new Date().toISOString();

  const tool_calls: ToolCallRecord[] = [
    {
      name: QUERY_CHAIN_TOOL_NAME,
      query: "swap_quote",
      result: quote,
    },
  ];

  const executeInputWithQuote: ExecuteTransactionInput = {
    ...executeInput,
    params,
  };

  let executeOutcome: ExecuteToolOutcome;
  try {
    executeOutcome = await runExecuteTransactionToolWithApproval(
      privyUserId,
      executeInputWithQuote,
      { sessionId },
    );
  } catch (err) {
    const mapped = mapAgentToolError(err);
    tool_calls.push({
      name: EXECUTE_TRANSACTION_TOOL_NAME,
      result: {
        error: {
          code: mapped instanceof AppError ? mapped.code : "SWAP_EXECUTE_FAILED",
          message: mapped instanceof AppError ? mapped.message : String(mapped),
        },
      },
    });
    return {
      reply: mapped instanceof AppError ? mapped.message : "Swap could not be submitted.",
      tool_calls,
      pending_transaction: null,
    };
  }

  tool_calls.push({
    name: EXECUTE_TRANSACTION_TOOL_NAME,
    result: executeOutcome,
  });

  if (executeOutcome.status === "approval_required") {
    return {
      reply: APPROVAL_REPLY,
      tool_calls,
      pending_transaction: executeOutcome.pending,
    };
  }

  const digest =
    executeOutcome.status === "executed" && executeOutcome.result?.digest
      ? ` Digest: ${executeOutcome.result.digest}.`
      : "";

  return {
    reply:
      `Swap submitted: ${intent.amount} ${intent.from_coin} → ~${quote.output_amount_display} ${quote.output_coin} on ${intent.pool_key}.${digest}`,
    tool_calls,
    pending_transaction: null,
  };
}
