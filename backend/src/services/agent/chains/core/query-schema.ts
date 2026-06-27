/** Chain-agnostic query types — available on any enabled chain. */
export const CORE_QUERY_TYPES = [
  "balance",
  "native_balance",
  "token_balances",
  "token_resolve",
  "bridge_capabilities",
  "supported_chains",
  "agent_transactions",
  "project_actions",
  "session_actions",
  "project_notification_schema",
] as const;

export type CoreQueryType = (typeof CORE_QUERY_TYPES)[number];

export const CORE_QUERY_SCHEMA: {
  description: string;
  paramsDescription: string;
} = {
  description:
    "balances, wallet holdings, agent_transactions, project_actions, session_actions, " +
    "project_notification_schema, token_resolve, bridge_capabilities, or supported_chains.",
  paramsDescription:
    "agent_transactions: optional { limit (max 10), status, category, session_id, transaction_id } — " +
    "returns recent agent wallet activity; response includes summary (date, amount, status, digest) to quote in chat. " +
    "project_actions: { project_id } OR { app_name } — saved project action schema. Never pass an app name as project_id. When the user pinned an app in chat, omit params — pinned scope is applied automatically (including installed apps). " +
    "project_notification_schema: { project_id } OR { app_name } — saved project notification alert types and condition fields. Same scope rules as project_actions. " +
    "session_actions: optional { app_name } — chat draft artifact action schema (unsaved preview). Uses current chat session. When an app is pinned, omit params. " +
    "token_resolve: { symbol } (or token / input) — resolve allowlisted token; optional evm_chain_id, to_chain_id for cross-ecosystem checks. Fuzzy typos return suggestions only. " +
    "bridge_capabilities: { from_chain_id, to_chain_id, from_evm_chain_id?, to_evm_chain_id?, from_token? } — " +
    "valid receive tokens for a bridge (chain-aware intersection); auto-fill hints for same-symbol ETH/USDC on EVM L2s. " +
    "supported_chains: {} — Radiant v1 enabled chains, providers, and token allowlists. " +
    "EVM balances: { evm_chain_id }.",
};
