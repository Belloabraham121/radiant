export function buildLifiSwapLines(): string[] {
  return [
    "For same-chain EVM swaps on enabled networks, use evm_swap_quote (SushiSwap — Phase 3) when available. Li-Fi can include DEX steps inside cross-chain routes but prefer Sushi for pure same-chain swaps.",
    "Before cross_chain_swap, call cross_chain_quote or cross_chain_routes. Compare bridges with cross_chain_routes when the user asks which bridge is best.",
    "Re-fetch quote after any approval transaction confirms — gas and calldata go stale quickly.",
    "Rate limit: prefer one quote per user intent; avoid hammering cross_chain_quote in a loop.",
  ];
}
