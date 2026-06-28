import { isLifiEnabled } from "../../../config/lifi.js";
import { resolveTokenSymbol } from "../../../config/supported-tokens.js";
import { getCrossChainRoutes } from "../../defi/cross-chain/cross-chain-router.service.js";
import type { LifiRoutesInput } from "../../defi/lifi/lifi.types.js";
import { resolveBridgeIntentAmount } from "../resolve-intent-amounts.js";
import { AppError } from "../../../errors/app-error.js";
import { mapAgentToolError } from "../../../utils/agent-tool-errors.js";
import type { ExecuteToolOutcome, PendingTransaction, ToolCallRecord } from "../agent.types.js";
import {
  buildCrossChainSwapParams,
  createPendingFromLiquidityFallbackOffer,
  isSmallCrossChainUsdAmount,
  LIQUIDITY_FALLBACK_BRIDGE_REPLY,
  pickBestCrossChainRoute,
} from "../cross-chain-intent-helpers.js";
import { preflightLifiExecuteBalance } from "../chains/evm/lifi/approval-preflight.js";
import { EXECUTE_TRANSACTION_TOOL_NAME } from "../execute-transaction.tool.js";
import { QUERY_CHAIN_TOOL_NAME } from "../query-chain.tool.js";
import { runExecuteTransactionToolWithApproval } from "../tools.js";
import type { PartialBridgeIntent } from "./bridge-intent.types.js";
import { withDefaultBridgeChains } from "./bridge-clarification-gaps.js";
import {
  createPendingTransaction,
  transferRequiresApproval,
} from "../transaction-approval.service.js";

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

  const tool_calls: ToolCallRecord[] = [];
  let routesResult;

  try {
    routesResult = await getCrossChainRoutes(
      privyUserId,
      routeParams as LifiRoutesInput,
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

  const bridgeUsdAmount =
    intent.amountUnit === "usd" && intent.amount !== undefined
      ? intent.amount
      : resolvedIntent.resolvedTokenAmount?.resolvedFromUsd ??
        (resolvedIntent.fromToken?.toUpperCase() === "USDC" &&
        resolvedIntent.amount !== undefined
          ? resolvedIntent.amount
          : undefined);

  const isSmallBridge = isSmallCrossChainUsdAmount(bridgeUsdAmount);

  const route = pickBestCrossChainRoute(routesResult.routes, {
    preferDirectRoutes: isSmallBridge,
    avoidFeeCollection: isSmallBridge,
  });
  if (!route) {
    const offer = routesResult.liquidity_fallback_offer;
    if (offer) {
      const pending = await createPendingFromLiquidityFallbackOffer(privyUserId, offer, {
        sessionId,
      });
      return {
        reply: LIQUIDITY_FALLBACK_BRIDGE_REPLY,
        tool_calls,
        pending_transaction: pending,
      };
    }

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
    action: "cross_chain_swap" as const,
    params: buildCrossChainSwapParams(route),
  };

  const needsApproval = await transferRequiresApproval(privyUserId, executeInput, {
    sessionId,
  });

  if (!needsApproval) {
    try {
      await preflightLifiExecuteBalance(privyUserId, executeInput);
    } catch (err) {
      const mapped = mapAgentToolError(err);
      return {
        reply:
          mapped instanceof AppError
            ? mapped.message
            : "Could not verify wallet balance for this bridge.",
        tool_calls,
        pending_transaction: null,
      };
    }

    const pending = await createPendingTransaction(privyUserId, executeInput, { sessionId });
    return {
      reply: "Submitting bridge transaction…",
      tool_calls,
      pending_transaction: { ...pending, auto_approve_eligible: true },
    };
  }

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

  if (executeOutcome.status === "liquidity_fallback_offered") {
    return {
      reply: LIQUIDITY_FALLBACK_BRIDGE_REPLY,
      tool_calls,
      pending_transaction: executeOutcome.pending,
    };
  }

  if (executeOutcome.status === "approval_required") {
    return {
      reply: APPROVAL_REPLY,
      tool_calls,
      pending_transaction: executeOutcome.pending,
    };
  }

  return {
    reply: `Bridge submitted: ${resolvedIntent.fromToken} → ${resolvedIntent.toToken} via ${route.bridges.join(", ") || "Li-Fi"}.`,
    tool_calls,
    pending_transaction: null,
  };
}
