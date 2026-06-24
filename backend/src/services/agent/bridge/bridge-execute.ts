import { isLifiEnabled } from "../../../config/lifi.js";
import { resolveTokenSymbol } from "../../../config/supported-tokens.js";
import { getLifiAdvancedRoutes } from "../../defi/lifi/lifi-routes.service.js";
import type { CrossChainRouteOption } from "../../defi/lifi/lifi.types.js";
import { AppError } from "../../../errors/app-error.js";
import { mapAgentToolError } from "../../../utils/agent-tool-errors.js";
import type { ExecuteToolOutcome, PendingTransaction, ToolCallRecord } from "../agent.types.js";
import { EXECUTE_TRANSACTION_TOOL_NAME } from "../execute-transaction.tool.js";
import { QUERY_CHAIN_TOOL_NAME } from "../query-chain.tool.js";
import { runExecuteTransactionToolWithApproval } from "../tools.js";
import type { PartialBridgeIntent } from "./bridge-intent.types.js";
import { withDefaultBridgeChains } from "./bridge-clarification-gaps.js";

export type ResolvedBridgeOutcome = {
  reply: string;
  tool_calls: ToolCallRecord[];
  pending_transaction: PendingTransaction | null;
};

const APPROVAL_REPLY =
  "This bridge needs your approval before I can submit it. Review the route and confirm in the dialog.";

function displayAmountToAtomic(
  amount: number,
  intent: PartialBridgeIntent,
): string | null {
  if (!intent.fromChainId || !intent.fromToken) {
    return null;
  }

  try {
    const resolved = resolveTokenSymbol(
      intent.fromChainId,
      intent.fromToken,
      intent.fromChainId === "ethereum" ? intent.fromEvmChainId : undefined,
    );
    const decimals = resolved.token.decimals;
    const factor = 10 ** decimals;
    const atomic = BigInt(Math.floor(amount * factor));
    if (atomic <= 0n) {
      return null;
    }
    return atomic.toString();
  } catch {
    return null;
  }
}

export function buildBridgeRouteParams(intent: PartialBridgeIntent): Record<string, unknown> | null {
  const resolved = withDefaultBridgeChains(intent);
  if (
    !resolved.fromChainId ||
    !resolved.toChainId ||
    !resolved.fromToken ||
    !resolved.toToken ||
    resolved.amount === undefined
  ) {
    return null;
  }

  const amountAtomic = displayAmountToAtomic(resolved.amount, resolved);
  if (!amountAtomic) {
    return null;
  }

  return {
    from_chain_id: resolved.fromChainId,
    to_chain_id: resolved.toChainId,
    from_evm_chain_id: resolved.fromEvmChainId,
    to_evm_chain_id: resolved.toEvmChainId,
    from_token: resolved.fromToken,
    to_token: resolved.toToken,
    amount_atomic: amountAtomic,
    confirm_same_token: resolved.confirmSameToken ?? false,
    max_routes: 3,
  };
}

function pickBestRoute(routes: CrossChainRouteOption[]): CrossChainRouteOption | null {
  if (routes.length === 0) {
    return null;
  }

  let best = routes[0];
  let bestScore = Number.POSITIVE_INFINITY;

  for (const route of routes) {
    const fee = route.fee_cost_usd ?? 0;
    const gas = route.gas_cost_usd ?? 0;
    const score = fee + gas;
    if (score < bestScore) {
      bestScore = score;
      best = route;
    }
  }

  return best;
}

function buildCrossChainSwapParams(route: CrossChainRouteOption): Record<string, unknown> {
  return {
    route_id: route.route_id,
    from_token: route.from_token_symbol,
    to_token: route.to_token_symbol,
    from_token_symbol: route.from_token_symbol,
    to_token_symbol: route.to_token_symbol,
    from_amount_atomic: route.from_amount_atomic,
    to_amount_atomic: route.to_amount_atomic,
    from_chain_id: route.from_chain_id,
    to_chain_id: route.to_chain_id,
    from_evm_chain_id: route.from_evm_chain_id,
    to_evm_chain_id: route.to_evm_chain_id,
    bridges: route.bridges,
    fee_cost_usd: route.fee_cost_usd,
    expires_at: route.expires_at,
  };
}

export async function executeResolvedBridgeIntent(
  privyUserId: string,
  intent: PartialBridgeIntent,
  sessionId?: string,
): Promise<ResolvedBridgeOutcome | null> {
  if (!isLifiEnabled()) {
    return {
      reply: "Cross-chain bridging is not enabled on this deployment.",
      tool_calls: [],
      pending_transaction: null,
    };
  }

  const routeParams = buildBridgeRouteParams(intent);
  if (!routeParams) {
    return null;
  }

  const tool_calls: ToolCallRecord[] = [];
  let routesResult;

  try {
    routesResult = await getLifiAdvancedRoutes(
      privyUserId,
      routeParams as Parameters<typeof getLifiAdvancedRoutes>[1],
    );
  } catch (err) {
    const mapped = mapAgentToolError(err);
    return {
      reply:
        mapped instanceof AppError
          ? mapped.message
          : "Could not find bridge routes — check the chains, tokens, and amount, then try again.",
      tool_calls: [
        {
          name: QUERY_CHAIN_TOOL_NAME,
          query: "cross_chain_routes",
          result: {
            error: {
              code: mapped instanceof AppError ? mapped.code : "BRIDGE_ROUTES_FAILED",
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

  const route = pickBestRoute(routesResult.routes);
  if (!route) {
    return {
      reply:
        "No bridge routes are available for that transfer right now. Try a different destination token or amount.",
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
          code: mapped instanceof AppError ? mapped.code : "BRIDGE_EXECUTE_FAILED",
          message: mapped instanceof AppError ? mapped.message : String(mapped),
        },
      },
    });
    return {
      reply: mapped instanceof AppError ? mapped.message : "Bridge could not be submitted.",
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

  return {
    reply: `Bridge submitted: ${intent.fromToken} → ${intent.toToken} via ${route.bridges.join(", ") || "Li-Fi"}.`,
    tool_calls,
    pending_transaction: null,
  };
}
