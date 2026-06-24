import type { Route } from "@lifi/types";
import type { ExecuteTransactionInput } from "../../../chains/types.js";
import {
  isLifiExecuteAction,
} from "../../../agent/chains/evm/lifi/execute-actions.js";
import {
  formatAtomicAmount,
  lifiToRadiantChainRef,
} from "../../../defi/lifi/lifi-chain-map.js";
import {
  normalizeLifiRouteToRouteQuote,
} from "../../../defi/lifi/lifi-normalize.js";
import { resolveLifiRouteForExecute } from "../../../defi/lifi/lifi-quote.service.js";
import { isDeFiQuoteFresh } from "../quote-expiry.js";

function sumUsd(costs: Array<{ amountUSD?: string }> | undefined): number | null {
  if (!costs || costs.length === 0) {
    return null;
  }
  let total = 0;
  let hasValue = false;
  for (const cost of costs) {
    const parsed = Number.parseFloat(cost.amountUSD ?? "");
    if (Number.isFinite(parsed)) {
      total += parsed;
      hasValue = true;
    }
  }
  return hasValue ? total : null;
}

function resolveRouteFeeUsd(route: Route): number | null {
  let gas: number | null = null;
  let fee: number | null = null;
  for (const step of route.steps) {
    gas = sumUsd(step.estimate?.gasCosts) ?? gas;
    fee = sumUsd(step.estimate?.feeCosts) ?? fee;
  }
  if (gas === null && fee === null) {
    return null;
  }
  return (gas ?? 0) + (fee ?? 0);
}

export function matchLifiExecuteInput(input: ExecuteTransactionInput): boolean {
  return isLifiExecuteAction(input.action);
}

/** Attach cross-chain quote display fields before showing the approval dialog. */
export async function enrichLifiExecuteInputForApproval(
  _privyUserId: string,
  input: ExecuteTransactionInput,
): Promise<ExecuteTransactionInput> {
  if (!matchLifiExecuteInput(input)) {
    return input;
  }

  if (isDeFiQuoteFresh(input.params)) {
    return input;
  }

  try {
    const route = await resolveLifiRouteForExecute({
      routeId: typeof input.params.route_id === "string" ? input.params.route_id : undefined,
      route:
        input.params.route && typeof input.params.route === "object"
          ? (input.params.route as Record<string, unknown>)
          : undefined,
    });

    const firstStep = route.steps[0];
    const lastStep = route.steps.at(-1);
    if (!firstStep || !lastStep) {
      return input;
    }

    const fromRef = lifiToRadiantChainRef(firstStep.action.fromChainId);
    const toRef = lifiToRadiantChainRef(lastStep.action.toChainId);
    const fromSymbol = firstStep.action.fromToken.symbol;
    const toSymbol = lastStep.action.toToken.symbol;

    const normalized = normalizeLifiRouteToRouteQuote({
      route,
      from: fromRef,
      to: toRef,
      fromTokenSymbol: fromSymbol,
      toTokenSymbol: toSymbol,
    });

    const fromAmountDisplay = formatAtomicAmount(
      route.fromAmount,
      firstStep.action.fromToken.decimals,
    );
    const toAmountDisplay = formatAtomicAmount(
      route.toAmount,
      lastStep.action.toToken.decimals,
    );

    return {
      ...input,
      params: {
        ...input.params,
        from_token_symbol: fromSymbol,
        to_token_symbol: toSymbol,
        from_amount_display: fromAmountDisplay,
        to_amount_display: toAmountDisplay,
        from_chain_id: normalized.from_chain_id,
        to_chain_id: normalized.to_chain_id,
        from_evm_chain_id:
          fromRef.chain_id === "ethereum" ? fromRef.evm_chain_id : undefined,
        to_evm_chain_id: toRef.chain_id === "ethereum" ? toRef.evm_chain_id : undefined,
        bridges: normalized.bridges,
        fee_cost_usd: resolveRouteFeeUsd(route),
        expires_at: normalized.expires_at,
        quote_expires_at: normalized.expires_at,
        slippage: firstStep.action.slippage,
      },
    };
  } catch {
    return input;
  }
}
