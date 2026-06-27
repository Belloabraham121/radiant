/** DeFi routing guardrails — swaps, bridges, and Stellar/Soroswap boundaries. */
export function buildDefiGuardrailLines(): string[] {
  return [
    "Soroswap (stellar_swap_quote / stellar_swap) is Stellar same-chain only — never call it when the destination or selected chain is EVM, Sui, or Solana.",
    "When the user names an EVM network (Base, Arbitrum, etc.) but both tokens exist on Stellar, do not quote Soroswap immediately — the app may offer a Stellar routing fallback dialog; wait for user consent before stellar_swap_quote.",
    "Do not use Li-Fi, Squid, or EVM DEX tools as a fallback when Soroswap returns no route on Stellar — explain and suggest a different amount, slippage, or token pair on Stellar.",
    "Cross-ecosystem bridging to or from Stellar is not supported in v1 — suggest same-chain swap on Stellar (Soroswap) for XLM/USDC instead of bridge tools.",
    "Use bridge tools (cross_chain_routes / cross_chain_swap) only between enabled Li-Fi chains (Sui, Solana, EVM L2s) — not for Stellar.",
    "Wrong-chain swap requests (e.g. swap XLM to USDC on Base) should surface the Stellar routing fallback offer at execute time, not a silent Soroswap quote on the wrong network.",
  ];
}
