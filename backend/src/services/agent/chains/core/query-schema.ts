/** Chain-agnostic query types — available on any enabled chain. */
export const CORE_QUERY_TYPES = [
  "balance",
  "native_balance",
  "token_balances",
  "token_resolve",
  "bridge_capabilities",
  "supported_chains",
  "agent_transactions",
] as const;

export type CoreQueryType = (typeof CORE_QUERY_TYPES)[number];

export const CORE_QUERY_SCHEMA: {
  description: string;
  paramsDescription: string;
} = {
  description:
    "balances, wallet holdings, agent_transactions, token_resolve, bridge_capabilities, or supported_chains.",
  paramsDescription:
    "agent_transactions: optional { limit (max 10), status, category, session_id, transaction_id } — " +
    "returns recent agent wallet activity; response includes summary (date, amount, status, digest) to quote in chat. " +
    "token_resolve: { symbol } (or token / input) — resolve allowlisted token; optional evm_chain_id, to_chain_id for cross-ecosystem checks. Fuzzy typos return suggestions only. " +
    "bridge_capabilities: { from_chain_id, to_chain_id, from_evm_chain_id?, to_evm_chain_id?, from_token? } — " +
    "valid receive tokens for a bridge (chain-aware intersection); auto-fill hints for same-symbol ETH/USDC on EVM L2s. " +
    "supported_chains: {} — Radiant v1 enabled chains, providers, and token allowlists. " +
    "EVM balances: { evm_chain_id }.",
};
