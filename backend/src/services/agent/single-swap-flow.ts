import type { ExecuteTransactionInput } from "../chains/types.js";
import { getDeepBookSwapQuote } from "../defi/deepbook-swap.service.js";
import type { ExecuteToolOutcome, PendingTransaction, ToolCallRecord } from "./agent.types.js";
import { isCompoundMarketAndSwapRequest } from "./compound-request-flow.js";
import { EXECUTE_TRANSACTION_TOOL_NAME } from "./execute-transaction.tool.js";
import { QUERY_CHAIN_TOOL_NAME } from "./query-chain.tool.js";
import { runExecuteTransactionToolWithApproval } from "./tools.js";
import { userRequestedSwap } from "./swap-approval-flow.js";
import { looksLikeWorkflowMessage } from "./workflow/heuristic-planner.js";
import { parseSingleSwapIntent } from "./workflow/workflow-parser.js";

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
): Promise<SingleSwapOutcome | null> {
  if (!userRequestedSwap(message)) {
    return null;
  }
  if (looksLikeWorkflowMessage(message)) {
    return null;
  }
  if (isCompoundMarketAndSwapRequest(message)) {
    return null;
  }

  const swapStep = parseSingleSwapIntent(message);
  if (!swapStep) {
    return null;
  }

  const executeInput = swapStep.input as ExecuteTransactionInput;
  const params = { ...executeInput.params } as Record<string, unknown>;

  let quote;
  try {
    quote = await getDeepBookSwapQuote(privyUserId, params);
  } catch {
    return null;
  }

  params.estimated_out_display = quote.output_amount_display;

  const tool_calls: ToolCallRecord[] = [
    {
      name: QUERY_CHAIN_TOOL_NAME,
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
    );
  } catch {
    return null;
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
    reply: `Swap submitted.${digest}`,
    tool_calls,
    pending_transaction: null,
  };
}
