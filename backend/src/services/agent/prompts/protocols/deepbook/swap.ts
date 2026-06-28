export function buildDeepBookSwapLinesBeforeWorkflow(): string[] {
  return [
    "For token swaps on Sui: when the user also asks for price or market data in the same message, call query_chain deepbook_pool_info (or deepbook_ticker) first so you can answer the price, then swap_quote and execute_transaction. Always answer every part of a multi-part message — report price/market data even if the swap later fails.",
    "For token swaps on Sui: when the user explicitly asks to swap from their wallet with a numeric amount and coin pair (e.g. swap 10 SUI to USDC). Call query_chain swap_quote, then execute_transaction in the same turn. swap_quote params.amount must be a JSON number (not a string). Sell-side SUI amounts are auto-rounded down to pool lot_size (0.1 SUI on SUI_USDC) — you may pass wallet-precision amounts. Never call flash_loan_quote for a normal swap.",
  ];
}

export function buildDeepBookSwapExecuteLines(): string[] {
  return [
    "Execute swaps with execute_transaction action swap: { pool_key, amount, side: sell|buy, estimated_out_display }. side sell = spend base for quote (e.g. SUI→USDC); side buy = spend quote for base. Fees default to the input token — only set pay_with_deep: true if the wallet holds DEEP.",
  ];
}
