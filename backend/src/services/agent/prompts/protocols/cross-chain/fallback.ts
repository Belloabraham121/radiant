export function buildCrossChainFallbackLines(): string[] {
  return [
    "When Li-Fi cannot find liquidity, the backend may return liquidity_fallback_offer instead of routes.",
    "Tell the user Li-Fi had no liquidity and an alternate route provider may be available — they must confirm in the dialog.",
    "Do NOT call cross_chain_swap until the user accepts the fallback offer. After accept, the system quotes Squid and opens a normal approval dialog.",
    "If the user declines the fallback offer, acknowledge and suggest trying a different amount, token, or destination.",
    "Keywords: alternate route, fallback offer, liquidity fallback, Squid.",
  ];
}
