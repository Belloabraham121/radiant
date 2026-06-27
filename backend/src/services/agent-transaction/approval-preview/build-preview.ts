import { getDeepBookEnv } from "../../../config/deepbook.js";
import type { ExecuteTransactionInput } from "../../chains/types.js";
import { isLifiExecuteAction } from "../../agent/chains/evm/lifi/execute-actions.js";
import { isSoroswapExecuteAction } from "../../agent/chains/stellar/soroswap/execute-actions.js";
import { isSquidCrossChainRoute } from "./enrichers/squid.js";
import {
  isDeepBookSwapAction,
  parseDeepBookSwapParams,
} from "../../defi/deepbook/deepbook-swap.service.js";
import type { TransactionDisplay } from "../deepbook/build-display.js";
import type { TransactionFiatPreview } from "../../market/valuation.types.js";
import { fmtDisplayNumber } from "../../../utils/format-display-number.js";
import { formatRadiantChainLabel } from "./chain-labels.js";
import type { DeFiApprovalPreview } from "./approval-preview.types.js";
import { readDeFiQuoteExpiresAt, isLifiContinuationApproval } from "./quote-expiry.js";
import type { ChainId } from "../../chains/types.js";

function readStringParam(params: Record<string, unknown>, key: string): string | null {
  const value = params[key];
  return typeof value === "string" && value.length > 0 ? value : null;
}

function readNumberParam(params: Record<string, unknown>, key: string): number | null {
  const value = params[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function readStringArrayParam(params: Record<string, unknown>, key: string): string[] {
  const value = params[key];
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((entry): entry is string => typeof entry === "string" && entry.length > 0);
}

function resolveChainLabel(
  chainId: ChainId | string | undefined,
  evmChainId: number | undefined,
): string | undefined {
  if (typeof chainId !== "string") {
    return undefined;
  }
  return formatRadiantChainLabel(chainId as ChainId, evmChainId);
}

function buildDeepBookSwapPreview(
  display: TransactionDisplay,
  input: ExecuteTransactionInput,
  fiat_preview: TransactionFiatPreview | null,
): DeFiApprovalPreview {
  const params = input.params;
  let paySymbol = readStringParam(params, "input_coin") ?? "token";
  let receiveSymbol = readStringParam(params, "output_coin") ?? "token";
  let payAmount = "";
  let receiveAmount = readNumberParam(params, "estimated_out_display")?.toString() ?? "";

  try {
    const parsed = parseDeepBookSwapParams(params);
    const poolDef =
      getDeepBookEnv().pools[parsed.pool_key as keyof ReturnType<typeof getDeepBookEnv>["pools"]];
    paySymbol =
      parsed.side === "sell"
        ? (poolDef?.baseCoin ?? paySymbol)
        : (poolDef?.quoteCoin ?? paySymbol);
    receiveSymbol =
      parsed.side === "sell"
        ? (poolDef?.quoteCoin ?? receiveSymbol)
        : (poolDef?.baseCoin ?? receiveSymbol);
    payAmount = fmtDisplayNumber(parsed.amount);
    if (!receiveAmount) {
      receiveAmount = readNumberParam(params, "estimated_out_display") !== null
        ? fmtDisplayNumber(readNumberParam(params, "estimated_out_display")!)
        : "";
    }
  } catch {
    payAmount = display.amount_display.split("→")[0]?.trim() ?? display.amount_display;
  }

  return {
    kind: "swap",
    provider_id: "sui-deepbook",
    title: display.title,
    amount_display: display.amount_display,
    pay: {
      symbol: paySymbol,
      amount_display: payAmount,
      chain_label: "Sui",
    },
    receive: receiveAmount
      ? {
          symbol: receiveSymbol,
          amount_display: receiveAmount,
          chain_label: "Sui",
        }
      : undefined,
    quote_expires_at: readDeFiQuoteExpiresAt(params),
    slippage: readNumberParam(params, "slippage"),
    fiat_preview,
  };
}

function buildSoroswapSwapPreview(
  display: TransactionDisplay,
  input: ExecuteTransactionInput,
  fiat_preview: TransactionFiatPreview | null,
): DeFiApprovalPreview {
  const params = input.params;
  const paySymbol =
    readStringParam(params, "token_in") ??
    readStringParam(params, "input_coin") ??
    readStringParam(params, "from_token") ??
    "token";
  const receiveSymbol =
    readStringParam(params, "token_out") ??
    readStringParam(params, "output_coin") ??
    readStringParam(params, "to_token") ??
    "token";
  const payAmount =
    readStringParam(params, "from_amount_display") ??
    readStringParam(params, "input_amount_display") ??
    "";
  const receiveAmount =
    readStringParam(params, "to_amount_display") ??
    readStringParam(params, "output_amount_display") ??
    (typeof params.estimated_out_display === "number"
      ? fmtDisplayNumber(params.estimated_out_display)
      : "");
  const minOut =
    typeof params.min_out_display === "number"
      ? fmtDisplayNumber(params.min_out_display)
      : null;

  return {
    kind: "swap",
    provider_id: "stellar-soroswap",
    title: display.title,
    amount_display: display.amount_display,
    pay: payAmount
      ? {
          symbol: paySymbol,
          amount_display: payAmount,
          chain_label: "Stellar",
        }
      : undefined,
    receive: receiveAmount
      ? {
          symbol: receiveSymbol,
          amount_display: minOut ? `≥${minOut}` : receiveAmount,
          chain_label: "Stellar",
        }
      : undefined,
    quote_expires_at: readDeFiQuoteExpiresAt(params),
    slippage: readNumberParam(params, "slippage"),
    fiat_preview,
  };
}

function buildCrossChainBridgePreview(
  display: TransactionDisplay,
  input: ExecuteTransactionInput,
  fiat_preview: TransactionFiatPreview | null,
): DeFiApprovalPreview {
  const params = input.params;
  const isSquid = isSquidCrossChainRoute(params);
  const paySymbol = readStringParam(params, "from_token_symbol") ?? readStringParam(params, "from_token") ?? "token";
  const receiveSymbol = readStringParam(params, "to_token_symbol") ?? readStringParam(params, "to_token") ?? "token";
  const payAmount = readStringParam(params, "from_amount_display") ?? "";
  const receiveAmount = readStringParam(params, "to_amount_display") ?? "";
  const fromChainLabel = resolveChainLabel(
    readStringParam(params, "from_chain_id") ?? undefined,
    readNumberParam(params, "from_evm_chain_id") ?? undefined,
  );
  const toChainLabel = resolveChainLabel(
    readStringParam(params, "to_chain_id") ?? undefined,
    readNumberParam(params, "to_evm_chain_id") ?? undefined,
  );
  const bridges = readStringArrayParam(params, "bridges");
  const routeSummary =
    bridges.length > 0
      ? `via ${bridges.join(" → ")}`
      : isSquid
        ? "via alternate liquidity route"
        : undefined;

  const title =
    fromChainLabel && toChainLabel
      ? `Bridge ${paySymbol} ${fromChainLabel} → ${toChainLabel}`
      : display.title;

  return {
    kind: "bridge",
    provider_id: isSquid ? "evm-squid" : "evm-lifi",
    title,
    amount_display: display.amount_display,
    pay: payAmount
      ? {
          symbol: paySymbol,
          amount_display: payAmount,
          chain_label: fromChainLabel,
        }
      : undefined,
    receive: receiveAmount
      ? {
          symbol: receiveSymbol,
          amount_display: receiveAmount,
          chain_label: toChainLabel,
        }
      : undefined,
    route_summary: routeSummary,
    bridges: bridges.length > 0 ? bridges : undefined,
    fee_cost_usd: readNumberParam(params, "fee_cost_usd"),
    quote_expires_at: readDeFiQuoteExpiresAt(params),
    slippage: readNumberParam(params, "slippage"),
    fiat_preview,
    ...(isSquid
      ? { alternate_route: true, route_provider_label: "Alternate route" }
      : {}),
  };
}

function buildLifiBridgePreview(
  display: TransactionDisplay,
  input: ExecuteTransactionInput,
  fiat_preview: TransactionFiatPreview | null,
): DeFiApprovalPreview {
  return buildCrossChainBridgePreview(display, input, fiat_preview);
}

function buildLifiContinuationPreview(
  display: TransactionDisplay,
  input: ExecuteTransactionInput,
  fiat_preview: TransactionFiatPreview | null,
): DeFiApprovalPreview {
  const params = input.params;
  const receiveSymbol =
    readStringParam(params, "to_token_symbol") ?? readStringParam(params, "to_token") ?? "token";
  const receiveAmount = readStringParam(params, "to_amount_display") ?? "";
  const toChainLabel = resolveChainLabel(
    readStringParam(params, "to_chain_id") ?? undefined,
    readNumberParam(params, "to_evm_chain_id") ?? undefined,
  );

  return {
    kind: "lifi_continue",
    provider_id: "evm-lifi",
    title: toChainLabel
      ? `Sign destination transaction on ${toChainLabel}`
      : "Sign destination transaction",
    amount_display: display.amount_display || `Complete ${receiveSymbol} transfer`,
    receive: receiveAmount
      ? {
          symbol: receiveSymbol,
          amount_display: receiveAmount,
          chain_label: toChainLabel,
        }
      : undefined,
    route_summary: "Continue in-flight cross-chain route — no new quote required",
    quote_expires_at: null,
    fiat_preview,
  };
}

function buildLifiApprovalPreview(
  display: TransactionDisplay,
  input: ExecuteTransactionInput,
  fiat_preview: TransactionFiatPreview | null,
): DeFiApprovalPreview {
  const bridgePreview = buildLifiBridgePreview(display, input, fiat_preview);
  return {
    ...bridgePreview,
    kind: "generic",
    title: "Approve token allowance",
    amount_display: display.amount_display || "ERC-20 approval for cross-chain route",
    route_summary: bridgePreview.route_summary ?? "Required before bridge execution",
  };
}

/** Build provider-agnostic DeFi approval preview for the client UI. */
export function buildDeFiApprovalPreview(
  display: TransactionDisplay,
  input: ExecuteTransactionInput,
  fiat_preview: TransactionFiatPreview | null,
): DeFiApprovalPreview | null {
  if (isDeepBookSwapAction(input.action)) {
    return buildDeepBookSwapPreview(display, input, fiat_preview);
  }

  if (isSoroswapExecuteAction(input.action) && input.chain_id === "stellar") {
    return buildSoroswapSwapPreview(display, input, fiat_preview);
  }

  if (input.action === "cross_chain_swap") {
    if (isLifiContinuationApproval(input.params)) {
      return buildLifiContinuationPreview(display, input, fiat_preview);
    }
    return buildLifiBridgePreview(display, input, fiat_preview);
  }

  if (input.action === "lifi_approve") {
    return buildLifiApprovalPreview(display, input, fiat_preview);
  }

  return null;
}
