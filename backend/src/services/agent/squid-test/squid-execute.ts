import { getSquidRoutes } from "../../defi/squid/squid-routes.service.js";
import type { SquidRoutesInput } from "../../defi/squid/squid.types.js";
import { resolveBridgeIntentAmount } from "../resolve-intent-amounts.js";
import { resolveSwapIntentAmount } from "../resolve-intent-amounts.js";
import type { PartialBridgeIntent } from "../bridge/bridge-intent.types.js";
import type { PartialSwapIntent } from "../swap/swap-intent.types.js";
import { AppError } from "../../../errors/app-error.js";
import { mapAgentToolError } from "../../../utils/agent-tool-errors.js";
import type { ExecuteToolOutcome, PendingTransaction, ToolCallRecord } from "../agent.types.js";
import {
  buildCrossChainSwapParams,
  pickBestCrossChainRoute,
} from "../cross-chain-intent-helpers.js";
import { buildBridgeRouteParams } from "../bridge/bridge-execute.js";
import { buildSameChainLifiRouteParams } from "../swap/swap-lifi-execute.js";
import { EXECUTE_TRANSACTION_TOOL_NAME } from "../execute-transaction.tool.js";
import { QUERY_CHAIN_TOOL_NAME } from "../query-chain.tool.js";
import { runExecuteTransactionToolWithApproval } from "../tools.js";
import type { CrossChainRoutesResult } from "../../defi/cross-chain/cross-chain.types.js";

function squidRouteFailureReply(mapped: AppError): string {
  if (mapped.code === "SQUID_NO_ROUTE") {
    return "Squid has no route for that transfer. Try `bridge` without the squid prefix for Li-Fi, or use `squid swap` for a same-chain trade.";
  }
  return mapped.message;
}

export type ResolvedSquidTestOutcome = {
  reply: string;
  tool_calls: ToolCallRecord[];
  pending_transaction: PendingTransaction | null;
};

const APPROVAL_REPLY =
  "This Squid route needs your approval before I can submit it. Review the route and confirm in the dialog.";

type GetSquidRoutesFn = (
  privyUserId: string,
  input: SquidRoutesInput,
) => Promise<CrossChainRoutesResult>;

let getSquidRoutesForTests: GetSquidRoutesFn | null = null;

/** Test hook — stub Squid route lookup in unit tests. */
export function setGetSquidRoutesForTests(fn: GetSquidRoutesFn | null): void {
  getSquidRoutesForTests = fn;
}

async function fetchSquidRoutes(
  privyUserId: string,
  params: SquidRoutesInput,
): Promise<CrossChainRoutesResult> {
  if (getSquidRoutesForTests) {
    return getSquidRoutesForTests(privyUserId, params);
  }
  return getSquidRoutes(privyUserId, params);
}

async function executeSquidRoute(
  privyUserId: string,
  routeParams: Record<string, unknown>,
  sessionId: string | undefined,
  successLabel: string,
): Promise<ResolvedSquidTestOutcome> {
  const tool_calls: ToolCallRecord[] = [];
  let routesResult: CrossChainRoutesResult;

  try {
    routesResult = await fetchSquidRoutes(privyUserId, routeParams as SquidRoutesInput);
  } catch (err) {
    const mapped = mapAgentToolError(err);
    return {
      reply:
        mapped instanceof AppError
          ? squidRouteFailureReply(mapped)
          : "Could not find a Squid route — check the chains, tokens, and amount, then try again.",
      tool_calls: [
        {
          name: QUERY_CHAIN_TOOL_NAME,
          query: "cross_chain_routes",
          result: {
            error: {
              code: mapped instanceof AppError ? mapped.code : "SQUID_ROUTES_FAILED",
              message: mapped instanceof AppError ? mapped.message : String(mapped),
            },
          },
        },
      ],
      pending_transaction: null,
    };
  }

  tool_calls.push({
    name: QUERY_CHAIN_TOOL_NAME,
    query: "cross_chain_routes",
    result: routesResult,
  });

  const route = pickBestCrossChainRoute(routesResult.routes);
  if (!route) {
    return {
      reply:
        "No Squid routes are available for that transfer right now. Try a different token, chain, or amount.",
      tool_calls,
      pending_transaction: null,
    };
  }

  const executeInput = {
    chain_id: route.from_chain_id,
    ...(route.from_evm_chain_id !== undefined ? { evm_chain_id: route.from_evm_chain_id } : {}),
    action: "cross_chain_swap",
    params: buildCrossChainSwapParams(route),
  };

  let executeOutcome: ExecuteToolOutcome;
  try {
    executeOutcome = await runExecuteTransactionToolWithApproval(
      privyUserId,
      executeInput,
      { sessionId },
    );
  } catch (err) {
    const mapped = mapAgentToolError(err);
    tool_calls.push({
      name: EXECUTE_TRANSACTION_TOOL_NAME,
      result: {
        error: {
          code: mapped instanceof AppError ? mapped.code : "SQUID_EXECUTE_FAILED",
          message: mapped instanceof AppError ? mapped.message : String(mapped),
        },
      },
    });
    return {
      reply: mapped instanceof AppError ? mapped.message : "Squid route could not be submitted.",
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

  const via = route.bridges.join(", ") || route.exchanges.join(", ") || "Squid";
  return {
    reply: `${successLabel} via ${via}.`,
    tool_calls,
    pending_transaction: null,
  };
}

export async function executeResolvedSquidBridgeIntent(
  privyUserId: string,
  intent: PartialBridgeIntent,
  sessionId?: string,
): Promise<ResolvedSquidTestOutcome | null> {
  let resolvedIntent: PartialBridgeIntent;
  try {
    resolvedIntent = await resolveBridgeIntentAmount(intent);
  } catch (err) {
    const mapped = mapAgentToolError(err);
    return {
      reply: mapped instanceof AppError ? mapped.message : "Could not resolve the bridge amount.",
      tool_calls: [],
      pending_transaction: null,
    };
  }

  const routeParams = buildBridgeRouteParams(resolvedIntent);
  if (!routeParams) {
    return null;
  }

  const fromToken = resolvedIntent.fromToken ?? "token";
  const toToken = resolvedIntent.toToken ?? "token";
  return executeSquidRoute(
    privyUserId,
    routeParams,
    sessionId,
    `Squid bridge submitted: ${fromToken} → ${toToken}`,
  );
}

export async function executeResolvedSquidSwapIntent(
  privyUserId: string,
  intent: PartialSwapIntent,
  sessionId?: string,
): Promise<ResolvedSquidTestOutcome | null> {
  let resolvedIntent: PartialSwapIntent;
  try {
    resolvedIntent = await resolveSwapIntentAmount(intent);
  } catch (err) {
    const mapped = mapAgentToolError(err);
    return {
      reply: mapped instanceof AppError ? mapped.message : "Could not resolve the swap amount.",
      tool_calls: [],
      pending_transaction: null,
    };
  }

  const routeParams = buildSameChainLifiRouteParams(resolvedIntent);
  if (!routeParams) {
    return null;
  }

  const amount = resolvedIntent.amount ?? 0;
  const inputCoin = resolvedIntent.inputCoin ?? "token";
  const outputCoin = resolvedIntent.outputCoin ?? "token";
  return executeSquidRoute(
    privyUserId,
    routeParams,
    sessionId,
    `Squid swap submitted: ${amount} ${inputCoin} → ${outputCoin}`,
  );
}
