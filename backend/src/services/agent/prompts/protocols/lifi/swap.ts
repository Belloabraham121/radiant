export function buildLifiSwapLines(): string[] {
  return [
    "For same-chain EVM swaps on enabled networks, use evm_swap_quote (SushiSwap — Phase 3) when available.",
    "For cross-chain bridges: when the user says 'bridge X from A to B', quote and prepare execute in one turn — cross_chain_quote then cross_chain_swap. Do not tell the user to ask for a quote separately.",
    "Compare bridges with cross_chain_routes when the user asks which bridge is best.",
    "Re-fetch quote after any approval transaction confirms — gas and calldata go stale quickly.",
    "Rate limit: prefer one quote per user intent; avoid hammering cross_chain_quote in a loop.",
  ];
}
