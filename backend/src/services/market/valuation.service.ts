import { isStablecoinSymbol } from "../defi/deepbook/asset-scalars.js";
import type { ExecuteTransactionInput } from "../chains/types.js";
import { isDeepBookSwapAction, parseDeepBookSwapParams } from "../defi/deepbook/deepbook-swap.service.js";
import { isLifiExecuteAction } from "../agent/chains/evm/lifi/execute-actions.js";
import { isSoroswapExecuteAction } from "../agent/chains/stellar/soroswap/execute-actions.js";
import { getDeepBookEnv } from "../../config/deepbook.js";
import type { WalletAssetsData } from "../wallet/wallet-assets.types.js";
import { resolveCoingeckoMarketData } from "./coingecko.client.js";
import { resolveCoingeckoId } from "./coingecko-symbols.js";
import type {
  FiatPriceSource,
  SwapFiatInput,
  SymbolAmount,
  TransactionFiatPreview,
  ValuationLeg,
} from "./valuation.types.js";

function roundUsd(value: number): number {
  return Math.round(value * 100) / 100;
}

function sumLegsUsd(legs: ValuationLeg[], role: ValuationLeg["role"]): number | null {
  const values = legs
    .filter((leg) => leg.role === role)
    .map((leg) => leg.usd_value)
    .filter((value): value is number => value !== null);
  if (values.length === 0) return null;
  return roundUsd(values.reduce((sum, value) => sum + value, 0));
}

function computeLegUsd(
  amount: number,
  usdPrice: number | null,
): number | null {
  if (usdPrice === null || !Number.isFinite(amount) || !Number.isFinite(usdPrice)) {
    return null;
  }
  return roundUsd(amount * usdPrice);
}

export async function resolveSymbolUsdPrices(
  symbols: string[],
): Promise<Map<string, { usdPrice: number | null; source: FiatPriceSource }>> {
  const unique = [...new Set(symbols.map((symbol) => symbol.toUpperCase()))];
  const result = new Map<string, { usdPrice: number | null; source: FiatPriceSource }>();

  for (const symbol of unique) {
    if (isStablecoinSymbol(symbol)) {
      result.set(symbol, { usdPrice: 1, source: "stablecoin_peg" });
    }
  }

  const coinIds: string[] = [];
  const symbolByCoinId = new Map<string, string>();
  for (const symbol of unique) {
    if (result.has(symbol)) continue;
    const coinId = resolveCoingeckoId(symbol);
    if (coinId) {
      coinIds.push(coinId);
      symbolByCoinId.set(coinId, symbol);
    }
  }

  if (coinIds.length > 0) {
    const market = await resolveCoingeckoMarketData(coinIds);
    for (const [coinId, row] of market) {
      const symbol = symbolByCoinId.get(coinId);
      if (!symbol || result.has(symbol)) continue;
      result.set(symbol, {
        usdPrice: row.usdPrice,
        source: row.usdPrice !== null ? "coingecko" : "unknown",
      });
    }
  }

  for (const symbol of unique) {
    if (!result.has(symbol)) {
      result.set(symbol, { usdPrice: null, source: "unknown" });
    }
  }

  return result;
}

function poolMidUsdPrice(
  symbol: string,
  poolPrice: number | null | undefined,
  baseSymbol: string | undefined,
  quoteSymbol: string | undefined,
): { usdPrice: number | null; source: FiatPriceSource } | null {
  if (poolPrice === null || poolPrice === undefined || !Number.isFinite(poolPrice) || poolPrice <= 0) {
    return null;
  }
  const normalized = symbol.toUpperCase();
  const base = baseSymbol?.toUpperCase();
  const quote = quoteSymbol?.toUpperCase();

  if (quote && isStablecoinSymbol(quote) && base && normalized === base) {
    return { usdPrice: poolPrice, source: "pool_mid" };
  }
  if (base && isStablecoinSymbol(base) && quote && normalized === quote) {
    return { usdPrice: 1 / poolPrice, source: "pool_mid" };
  }
  return null;
}

async function priceSymbolAmount(
  leg: SymbolAmount & { role: ValuationLeg["role"] },
  priceMap: Map<string, { usdPrice: number | null; source: FiatPriceSource }>,
  poolContext?: {
    pool_price?: number | null;
    base_symbol?: string;
    quote_symbol?: string;
  },
): Promise<ValuationLeg> {
  const symbol = leg.symbol.toUpperCase();
  let { usdPrice, source } = priceMap.get(symbol) ?? { usdPrice: null, source: "unknown" as const };

  if (usdPrice === null && poolContext) {
    const mid = poolMidUsdPrice(
      symbol,
      poolContext.pool_price,
      poolContext.base_symbol,
      poolContext.quote_symbol,
    );
    if (mid) {
      usdPrice = mid.usdPrice;
      source = mid.source;
    }
  }

  return {
    role: leg.role,
    amount_display: leg.amount_display,
    symbol: leg.symbol,
    usd_price: usdPrice,
    usd_value: computeLegUsd(leg.amount_display, usdPrice),
    price_source: source,
  };
}

export async function previewSwapFiat(input: SwapFiatInput): Promise<TransactionFiatPreview> {
  const symbols = [input.pay.symbol, input.receive.symbol];
  if (input.fee) symbols.push(input.fee.symbol);

  const priceMap = await resolveSymbolUsdPrices(symbols);
  const poolContext = {
    pool_price: input.pool_price,
    base_symbol: input.base_symbol,
    quote_symbol: input.quote_symbol,
  };

  const legs: ValuationLeg[] = [
    await priceSymbolAmount({ ...input.pay, role: "pay" }, priceMap, poolContext),
    await priceSymbolAmount({ ...input.receive, role: "receive" }, priceMap, poolContext),
  ];

  if (input.fee && input.fee.amount_display > 0) {
    legs.push(await priceSymbolAmount({ ...input.fee, role: "fee" }, priceMap, poolContext));
  }

  const totalPayUsd = sumLegsUsd(legs, "pay");
  const totalReceiveUsd = sumLegsUsd(legs, "receive");
  const feeUsd = sumLegsUsd(legs, "fee") ?? 0;
  const netUsd =
    totalReceiveUsd !== null || totalPayUsd !== null
      ? roundUsd((totalReceiveUsd ?? 0) - (totalPayUsd ?? 0) - feeUsd)
      : null;

  const hasAnyPrice = legs.some((leg) => leg.usd_value !== null);

  return {
    legs,
    total_pay_usd: totalPayUsd,
    total_receive_usd: totalReceiveUsd,
    net_usd: netUsd,
    priced_at: hasAnyPrice ? new Date().toISOString() : null,
  };
}

export async function previewExecuteTransactionFiat(
  input: ExecuteTransactionInput,
): Promise<TransactionFiatPreview | null> {
  if (isDeepBookSwapAction(input.action) && input.chain_id === "sui") {
    try {
      const parsed = parseDeepBookSwapParams(input.params);
      const poolDef =
        getDeepBookEnv().pools[parsed.pool_key as keyof ReturnType<typeof getDeepBookEnv>["pools"]];
      const inputCoin =
        parsed.side === "sell"
          ? (poolDef?.baseCoin ?? "base")
          : (poolDef?.quoteCoin ?? "quote");
      const outputCoin =
        parsed.side === "sell"
          ? (poolDef?.quoteCoin ?? "quote")
          : (poolDef?.baseCoin ?? "base");
      const estOut =
        typeof input.params.estimated_out_display === "number"
          ? input.params.estimated_out_display
          : null;
      if (estOut === null) return null;

      const poolPrice =
        typeof input.params.estimated_price === "number"
          ? input.params.estimated_price
          : typeof input.params.price === "number"
            ? input.params.price
            : null;

      return previewSwapFiat({
        chain_id: input.chain_id,
        pay: { amount_display: parsed.amount, symbol: inputCoin },
        receive: { amount_display: estOut, symbol: outputCoin },
        pool_price: poolPrice,
        base_symbol: poolDef?.baseCoin,
        quote_symbol: poolDef?.quoteCoin,
      });
    } catch {
      return null;
    }
  }

  if (isSoroswapExecuteAction(input.action) && input.chain_id === "stellar") {
    const payAmount = Number(
      input.params.from_amount_display ?? input.params.input_amount_display,
    );
    const receiveAmount = Number(
      input.params.to_amount_display ??
        input.params.output_amount_display ??
        input.params.estimated_out_display,
    );
    const paySymbol =
      typeof input.params.token_in === "string"
        ? input.params.token_in
        : typeof input.params.input_coin === "string"
          ? input.params.input_coin
          : null;
    const receiveSymbol =
      typeof input.params.token_out === "string"
        ? input.params.token_out
        : typeof input.params.output_coin === "string"
          ? input.params.output_coin
          : null;

    if (
      !Number.isFinite(payAmount) ||
      !Number.isFinite(receiveAmount) ||
      !paySymbol ||
      !receiveSymbol
    ) {
      return null;
    }

    return previewSwapFiat({
      chain_id: "stellar",
      pay: { amount_display: payAmount, symbol: paySymbol },
      receive: { amount_display: receiveAmount, symbol: receiveSymbol },
    });
  }

  if (isLifiExecuteAction(input.action) && input.action === "cross_chain_swap") {
    const payAmount = Number(input.params.from_amount_display);
    const receiveAmount = Number(input.params.to_amount_display);
    const paySymbol =
      typeof input.params.from_token_symbol === "string"
        ? input.params.from_token_symbol
        : null;
    const receiveSymbol =
      typeof input.params.to_token_symbol === "string"
        ? input.params.to_token_symbol
        : null;

    if (
      !Number.isFinite(payAmount) ||
      !Number.isFinite(receiveAmount) ||
      !paySymbol ||
      !receiveSymbol
    ) {
      return null;
    }

    return previewSwapFiat({
      chain_id: input.chain_id,
      pay: { amount_display: payAmount, symbol: paySymbol },
      receive: { amount_display: receiveAmount, symbol: receiveSymbol },
    });
  }

  return null;
}

export function formatUsd(value: number | null | undefined, opts?: { prefix?: string }): string | null {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return null;
  }
  const prefix = opts?.prefix ?? "~$";
  return `${prefix}${value.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

export function formatWalletAssetsSummary(result: WalletAssetsData): string {
  const held = result.assets.filter((asset) => asset.balance_atomic !== "0");
  if (held.length === 0) {
    return "Your wallet has no non-zero token balances on this chain.";
  }

  const lines = held.slice(0, 12).map((asset) => {
    const usd =
      asset.usd_value !== null && asset.usd_value !== undefined
        ? ` (${formatUsd(asset.usd_value, { prefix: "~$" })})`
        : "";
    return `- ${asset.balance_display} ${asset.symbol}${usd}`;
  });

  const total =
    result.total_usd !== null && result.total_usd !== undefined
      ? `\nEstimated total: ${formatUsd(result.total_usd, { prefix: "~$" })}.`
      : "";

  return `Wallet balances:\n${lines.join("\n")}${total}`;
}

export function formatSwapQuoteSummary(
  quote: {
    input_amount_display: number;
    input_coin: string;
    output_amount_display: number;
    output_coin: string;
    pool_key: string;
  },
  fiat?: TransactionFiatPreview | null,
): string {
  let summary =
    `Swap quote: ${quote.input_amount_display} ${quote.input_coin} → ` +
    `~${quote.output_amount_display} ${quote.output_coin} (${quote.pool_key})`;

  if (
    fiat &&
    fiat.total_pay_usd !== null &&
    fiat.total_receive_usd !== null
  ) {
    summary +=
      `\nEstimated value: ${formatUsd(fiat.total_pay_usd)} → ${formatUsd(fiat.total_receive_usd)}`;
    if (fiat.net_usd !== null) {
      summary += ` (net ${formatUsd(fiat.net_usd)})`;
    }
  }

  return summary;
}
