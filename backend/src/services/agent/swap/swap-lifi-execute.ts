import { isLifiEnabled } from "../../../config/lifi.js";
import { isLifiRadiantChain } from "../../../config/lifi-chains.js";
import { resolveTokenSymbol } from "../../../config/supported-tokens.js";
import { getCrossChainRoutes } from "../../defi/cross-chain/cross-chain-router.service.js";
import type { LifiRoutesInput } from "../../defi/lifi/lifi.types.js";
import { resolveSwapIntentAmount } from "../resolve-intent-amounts.js";
import { AppError } from "../../../errors/app-error.js";
import { mapAgentToolError } from "../../../utils/agent-tool-errors.js";
import type { ExecuteToolOutcome, ToolCallRecord } from "../agent.types.js";
import {
  buildCrossChainSwapParams,
  createPendingFromLiquidityFallbackOffer,
  LIQUIDITY_FALLBACK_SWAP_REPLY,
  pickBestCrossChainRoute,
} from "../cross-chain-intent-helpers.js";
import { EXECUTE_TRANSACTION_TOOL_NAME } from "../execute-transaction.tool.js";
import { QUERY_CHAIN_TOOL_NAME } from "../query-chain.tool.js";
import { runExecuteTransactionToolWithApproval } from "../tools.js";
import { withDefaultChain } from "./swap-clarification-gaps.js";
import type { ResolvedSwapOutcome } from "./swap-execute.js";
import type { PartialSwapIntent } from "./swap-intent.types.js";
import { isTokenOnChain } from "./token-chain-affinity.js";

const APPROVAL_REPLY =
  "This swap needs your approval before I can submit it. Review the route and confirm in the dialog.";

function displayAmountToAtomic(amount: number, intent: PartialSwapIntent): string | null {
  if (!intent.chainId || !intent.inputCoin) {
    return null;
  }

  try {
    const resolved = resolveTokenSymbol(
      intent.chainId,
      intent.inputCoin,
      intent.chainId === "ethereum" ? intent.evmChainId : undefined,
    );
    if (resolved.match !== "exact") {
      return null;
    }
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

/** Whether this resolved swap intent should execute via Li-Fi on the same chain. */
export function isLifiSameChainSwapEligible(intent: PartialSwapIntent): boolean {
  if (!isLifiEnabled()) {
    return false;
  }

  const resolved = withDefaultChain(intent);
  if (
    !resolved.chainId ||
    !resolved.inputCoin ||
    !resolved.outputCoin ||
    (resolved.chainId === "ethereum" && resolved.evmChainId === undefined)
  ) {
    return false;
  }

  if (
    !isTokenOnChain(resolved.inputCoin, resolved.chainId, resolved.evmChainId) ||
    !isTokenOnChain(resolved.outputCoin, resolved.chainId, resolved.evmChainId)
  ) {
    return false;
  }

  if (resolved.chainId === "ethereum" && resolved.evmChainId !== undefined) {
    return true;
  }
  if (resolved.chainId === "solana") {
    return true;
  }
  return false;
}

export function buildSameChainLifiRouteParams(
  intent: PartialSwapIntent,
): Record<string, unknown> | null {
  const resolved = withDefaultChain(intent);
  if (
    !resolved.chainId ||
    !isLifiRadiantChain(resolved.chainId) ||
    !resolved.inputCoin ||
    !resolved.outputCoin ||
    resolved.amount === undefined
  ) {
    return null;
  }

  const amountAtomic = displayAmountToAtomic(resolved.amount, resolved);
  if (!amountAtomic) {
    return null;
  }

  const params: Record<string, unknown> = {
    from_chain_id: resolved.chainId,
    to_chain_id: resolved.chainId,
    from_token: resolved.inputCoin,
    to_token: resolved.outputCoin,
    amount_atomic: amountAtomic,
    max_routes: 3,
  };

  if (resolved.chainId === "ethereum" && resolved.evmChainId !== undefined) {
    params.from_evm_chain_id = resolved.evmChainId;
    params.to_evm_chain_id = resolved.evmChainId;
  }

  return params;
}

export async function executeResolvedLifiSameChainSwap(
  privyUserId: string,
  intent: PartialSwapIntent,
  sessionId?: string,
): Promise<ResolvedSwapOutcome | null> {
  if (!isLifiEnabled()) {
    return {
      reply: "Same-chain swaps via Li-Fi are not enabled on this deployment.",
      tool_calls: [],
      pending_transaction: null,
    };
  }

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
          : "Could not find swap routes — check the tokens, network, and amount, then try again.",
      tool_calls: [
        {
          name: QUERY_CHAIN_TOOL_NAME,
          query: "cross_chain_routes",
          result: {
            error: {
              code: mapped instanceof AppError ? mapped.code : "SWAP_ROUTES_FAILED",
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
    const offer = routesResult.liquidity_fallback_offer;
    if (offer) {
      const pending = await createPendingFromLiquidityFallbackOffer(privyUserId, offer, {
        sessionId,
      });
      return {
        reply: LIQUIDITY_FALLBACK_SWAP_REPLY,
        tool_calls,
        pending_transaction: pending,
      };
    }

    return {
      reply:
        "No swap routes are available for that pair right now. Try a different token or amount.",
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

  if (executeOutcome.status === "liquidity_fallback_offered") {
    return {
      reply: LIQUIDITY_FALLBACK_SWAP_REPLY,
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

  const amount = resolvedIntent.amount ?? 0;
  const via = route.exchanges.join(", ") || route.bridges.join(", ") || "Li-Fi";

  return {
    reply: `Swap submitted: ${amount} ${resolvedIntent.inputCoin} → ${resolvedIntent.outputCoin} via ${via}.`,
    tool_calls,
    pending_transaction: null,
  };
}
