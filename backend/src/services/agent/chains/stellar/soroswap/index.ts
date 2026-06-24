/** Phase 1 — Soroswap query stub (schema only). */
export const STELLAR_SOROSWAP_QUERY_TYPES = ["stellar_swap_quote"] as const;

export const STELLAR_SOROSWAP_QUERY_SCHEMA = {
  description: "stellar_swap_quote (Soroswap, Phase 1).",
  paramsDescription:
    "stellar_swap_quote: { token_in, token_out, amount } — Soroban swap quote via Soroswap API (Phase 1).",
};

export const STELLAR_SOROSWAP_EXECUTE_ACTIONS = ["stellar_swap"] as const;

export const STELLAR_SOROSWAP_EXECUTE_SCHEMA = {
  actionDescription: "stellar_swap (Soroswap — Phase 1).",
  paramsDescription:
    "stellar_swap: { transaction_xdr } or quote reference — Phase 1; use stellar_swap_quote first.",
};
