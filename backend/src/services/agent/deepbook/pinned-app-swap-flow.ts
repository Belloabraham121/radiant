import { getDeepBookSwapQuote } from "../../defi/deepbook/deepbook-swap.service.js";
import { AppError } from "../../../errors/app-error.js";
import { mapAgentToolError } from "../../../utils/agent-tool-errors.js";
import type { PendingTransaction, ToolCallRecord } from "../agent.types.js";
import { parseSwapExecutionIntent } from "../execution-intent.js";
import { isCompoundMarketAndSwapRequest } from "./compound-request-flow.js";
import { looksLikeWorkflowMessage } from "../workflow/heuristic-planner.js";
import { QUERY_CHAIN_TOOL_NAME } from "../query-chain.tool.js";
import { CALL_APP_ACTION_TOOL_NAME, runCallAppActionTool } from "../../projects/call-app-action.tool.js";
import type { AppActionResult } from "../../projects/app-action.types.js";
import type { PinnedAppScope } from "../../projects/pinned-app-scope.types.js";
import { scopeDisplayName } from "../../projects/pinned-app-scope.types.js";

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

/** Brief pause so the preview iframe can open and subscribe before stream + approval events. */
const PINNED_SWAP_PREVIEW_LEAD_MS = 350;

export type PinnedAppSwapOutcome = {
  reply: string;
  tool_calls: ToolCallRecord[];
  pending_transaction: PendingTransaction | null;
};

const APPROVAL_REPLY =
  "I've filled in the swap in your app preview — review the quote and confirm there.";

function appActionErrorToToolResult(result: AppActionResult): unknown {
  if (result.status !== "error") {
    return result;
  }
  return {
    error: {
      code: result.error.code,
      message: result.error.message,
      ...(result.error.details !== undefined ? { details: result.error.details } : {}),
    },
  };
}

/** Deterministic swap through a pinned @ app — drives preview UI via call_app_action + agent stream. */
export async function tryExecutePinnedAppSwapFromMessage(
  privyUserId: string,
  message: string,
  sessionId: string,
  pinnedScope: PinnedAppScope,
): Promise<PinnedAppSwapOutcome | null> {
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

  const params = { ...(intent.execute.input.params as Record<string, unknown>) };

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

  const swapParams: Record<string, unknown> = {
    pool_key: intent.pool_key,
    amount: intent.amount,
    side: intent.side,
    input_coin: quote.input_coin,
    output_coin: quote.output_coin,
    estimated_out_display: quote.output_amount_display,
    min_out_display: quote.min_out_display,
    quote_expires_at: quote.expires_at,
    quoted_at: new Date().toISOString(),
  };

  const tool_calls: ToolCallRecord[] = [
    {
      name: QUERY_CHAIN_TOOL_NAME,
      query: "swap_quote",
      result: quote,
    },
  ];

  await delay(PINNED_SWAP_PREVIEW_LEAD_MS);

  let appResult: AppActionResult;
  try {
    appResult = await runCallAppActionTool(
      privyUserId,
      {
        action: "swap",
        params: swapParams,
      },
      {
        sessionId,
        pinnedAppScope: pinnedScope,
        broadcast: true,
      },
    );
  } catch (err) {
    const mapped = mapAgentToolError(err);
    tool_calls.push({
      name: CALL_APP_ACTION_TOOL_NAME,
      action: "swap",
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
    name: CALL_APP_ACTION_TOOL_NAME,
    action: "swap",
    result: appResult,
  });

  if (appResult.status === "approval_required") {
    return {
      reply: APPROVAL_REPLY,
      tool_calls,
      pending_transaction: appResult.pending,
    };
  }

  if (appResult.status === "error") {
    return {
      reply: appResult.error.message,
      tool_calls: tool_calls.map((call, index) =>
        index === tool_calls.length - 1
          ? { ...call, result: appActionErrorToToolResult(appResult) }
          : call,
      ),
      pending_transaction: null,
    };
  }

  const digest = appResult.digest ? ` Digest: ${appResult.digest}.` : "";
  const appName = scopeDisplayName(pinnedScope);

  return {
    reply:
      `Swap submitted in ${appName}: ${intent.amount} ${intent.from_coin} → ~${quote.output_amount_display} ${quote.output_coin} on ${intent.pool_key}.${digest}`,
    tool_calls,
    pending_transaction: null,
  };
}
