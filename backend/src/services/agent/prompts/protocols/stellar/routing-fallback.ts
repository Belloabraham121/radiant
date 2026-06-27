export function buildStellarRoutingFallbackLines(): string[] {
  return [
    "When the user selects a non-Stellar chain but both tokens exist on Stellar, the backend may return stellar_routing_fallback_offer.",
    "Tell the user the swap is not available on their selected network and they can swap on Stellar instead — they must confirm in the dialog.",
    "Do NOT call stellar_swap or stellar_swap_quote until the user accepts the Stellar routing fallback.",
    "If the user declines, acknowledge cleanly — the swap was not submitted and no Stellar quote should be fetched.",
    "Do not name Soroswap in user-facing copy — say 'swap on Stellar' or 'Stellar network'.",
    "Keywords: Stellar routing fallback, wrong network, swap on Stellar, XLM, stellar_routing_fallback_offered.",
  ];
}
