import { AppError } from "../../../../../errors/app-error.js";
import { isSoroswapEnabled } from "../../../../../config/soroswap.js";
import type { StellarSwapQuote } from "../../../../defi/types.js";
import { normalizeSoroswapQuote } from "../../../../defi/soroswap/soroswap-normalize.js";
import { getSoroswapQuote } from "../../../../defi/soroswap/soroswap-quote.service.js";
import { soroswapQuoteInputSchema } from "../../../../defi/soroswap/soroswap.types.js";
import type { ChainQueryHandler, QueryHandlerContext } from "../../types.js";

export type StellarSwapQuoteResult = StellarSwapQuote & {
  chain_id: "stellar";
};

function assertStellar(ctx: QueryHandlerContext): void {
  if (ctx.chainId !== "stellar") {
    throw new AppError(
      400,
      "UNSUPPORTED_QUERY",
      "stellar_swap_quote is only available on Stellar.",
    );
  }
}

function assertSoroswapReady(): void {
  if (!isSoroswapEnabled()) {
    throw new AppError(
      503,
      "SOROSWAP_UNAVAILABLE",
      "Stellar swap service is temporarily unavailable.",
    );
  }
}

function mergeStellarSwapQuoteParams(ctx: QueryHandlerContext): Record<string, unknown> {
  const params = ctx.params;
  return {
    token_in: params.token_in ?? params.input_coin ?? params.from_token,
    token_out: params.token_out ?? params.output_coin ?? params.to_token,
    amount: params.amount ?? params.amount_atomic ?? params.amount_stroops,
    trade_type: params.trade_type ?? params.tradeType,
    slippage: params.slippage,
    from_address: params.from_address ?? ctx.walletAddress,
    skip_cache: params.skip_cache,
  };
}

const stellarSwapQuoteHandler: ChainQueryHandler = async (ctx) => {
  assertStellar(ctx);
  assertSoroswapReady();

  const input = soroswapQuoteInputSchema.parse(mergeStellarSwapQuoteParams(ctx));
  const result = await getSoroswapQuote(ctx.privyUserId, input);

  const quote = normalizeSoroswapQuote({
    token_in: input.token_in,
    token_out: input.token_out,
    quote_id: result.quote_id,
    quote: result.quote,
  });

  return {
    chain_id: "stellar",
    ...quote,
    expires_at: quote.expires_at ?? result.expires_at,
  } satisfies StellarSwapQuoteResult;
};

export const STELLAR_SOROSWAP_QUERY_HANDLERS: Record<string, ChainQueryHandler> = {
  stellar_swap_quote: stellarSwapQuoteHandler,
};

export function getStellarSoroswapQueryHandler(query: string): ChainQueryHandler | null {
  return STELLAR_SOROSWAP_QUERY_HANDLERS[query] ?? null;
}
