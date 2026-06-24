export function buildLifiBridgeLines(): string[] {
  return [
    "Bridge flow: token_resolve → cross_chain_quote (or cross_chain_routes to compare bridges) → user approval → cross_chain_swap → poll cross_chain_status with source tx_hash.",
    "cross_chain_swap params: route_id from the quote, or the serialized route object. One approval can cover the full route when required.",
    "After broadcast, poll cross_chain_status until status is DONE, FAILED, or REFUNDED. Explain PENDING vs DONE vs FAILED in plain language.",
    "If execute returns pending_step, the destination chain may need another agent turn — do not claim the bridge finished.",
    "Use cross_chain_connections when the user asks which chains or tokens can be bridged (filtered to Radiant allowlist).",
  ];
}
