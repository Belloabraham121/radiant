export function buildLifiSwapLines(): string[] {
  return [
    "For same-chain EVM swaps on enabled networks, use evm_swap_quote (SushiSwap — Phase 3) when available.",
    "For cross-chain bridges: when the user says 'bridge X from A to B', use cross_chain_routes to get options, pick the lowest-fee route, then call cross_chain_swap immediately in the same turn. Calling cross_chain_swap opens an approval popup — it does not broadcast the transaction. Never tell the user you cannot execute or that they need to select a route.",
    "Use cross_chain_routes (not cross_chain_quote) for bridges so the best route by fee is auto-selected. cross_chain_quote is only needed when routes is unavailable.",
    "Re-fetch quote after any approval transaction confirms — gas and calldata go stale quickly.",
    "Rate limit: prefer one quote per user intent; avoid hammering cross_chain_quote in a loop.",
  ];
}
