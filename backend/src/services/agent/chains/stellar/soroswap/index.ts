export const STELLAR_SOROSWAP_QUERY_TYPES = ["stellar_swap_quote"] as const;

export const STELLAR_SOROSWAP_QUERY_SCHEMA = {
  description: "stellar_swap_quote (Soroswap — Stellar same-chain swaps).",
  paramsDescription:
    "stellar_swap_quote: { token_in, token_out, amount } — amount in stroops (1 XLM = 10^7). " +
    "Optional: trade_type (EXACT_IN|EXACT_OUT), slippage (fraction, e.g. 0.01), from_address. " +
    "Aliases: input_coin/output_coin or from_token/to_token; amount_atomic/amount_stroops for amount. " +
    "Returns quote fields, route_id (soroswap:…), and expires_at. Call before stellar_swap.",
};

export {
  getStellarSoroswapQueryHandler,
  STELLAR_SOROSWAP_QUERY_HANDLERS,
} from "./query-handlers.js";

export const STELLAR_SOROSWAP_EXECUTE_ACTIONS = ["stellar_swap"] as const;

export const STELLAR_SOROSWAP_EXECUTE_SCHEMA = {
  actionDescription: "stellar_swap (Soroswap — Phase 1).",
  paramsDescription:
    "stellar_swap: { transaction_xdr } or quote reference — Phase 1; use stellar_swap_quote first.",
};
