export function buildSoroswapSwapLines(): string[] {
  return [
    "Call query_chain stellar_swap_quote before execute_transaction stellar_swap on Stellar.",
    "Pass token_in, token_out, amount (stroops string), trade_type (EXACT_IN default), optional slippage.",
    "Never call stellar_swap_quote or stellar_swap when the destination chain is EVM, Sui, or Solana — Stellar only.",
    "Before swapping to USDC: user needs a USDC trustline and enough XLM for base reserve + fees.",
    "Unfunded Stellar accounts cannot swap — ask the user to fund the wallet with XLM first.",
    "After approval delay, re-run stellar_swap_quote if the quote expired — do not reuse stale quote_id.",
    "If the user picked the wrong network but both tokens exist on Stellar, wait for stellar_routing_fallback consent — do not call Soroswap until they accept.",
    "Keywords: Stellar, XLM, USDC, Soroban, stellar_swap_quote, stellar_swap.",
  ];
}
