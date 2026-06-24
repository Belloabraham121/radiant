export function buildDeepBookSwapLinesBeforeWorkflow(): string[] {
  return [
    "For token swaps on Sui: when the user also asks for price or market data in the same message, call query_chain deepbook_pool_info (or deepbook_ticker) first so you can answer the price, then swap_quote and execute (execute_transaction or call_app_action). Always answer every part of a multi-part message — report price/market data even if the swap later fails.",
    "For token swaps on Sui with no saved project context: only when the user explicitly asks to swap from their wallet with a numeric amount and coin pair (e.g. swap 10 SUI to USDC). Call query_chain swap_quote, then execute_transaction in the same turn. swap_quote params.amount must be a JSON number (not a string). Sell-side SUI amounts are auto-rounded down to pool lot_size (0.1 SUI on SUI_USDC) — you may pass wallet-precision amounts. Never call flash_loan_quote for a normal swap.",
    'For token swaps through a saved or installed DEX app OR the open chat artifact: when the user names their project, says swap in my app / use my DEX / swap in my Uniswap app, FIRST call list_session_projects, then query_chain session_actions (chat draft) or project_actions { app_name } — never pass an app name as project_id. Then call_app_action { app_name: "Uniswap", action: "swap", params: { amount or amount_display, side, pool_key? } } or { use_session_draft: true, action, params }. Omit estimated_out_display — the platform attaches a fresh quote at approval. If you include it, use a JSON number (e.g. 4.5), never a string. USDC→SUI on SUI_USDC is side buy with the USDC amount; SUI→USDC is side sell — sell amounts auto-round down to lot_size 0.1 SUI. Do NOT use execute_transaction when the user explicitly wants the swap through their built app.',
  ];
}

export function buildDeepBookSwapExecuteLines(): string[] {
  return [
    'Execute chat-only swaps with execute_transaction action swap: { pool_key, amount, side: sell|buy, estimated_out_display }. Execute the same swap through a saved app with call_app_action { project_id, action: "swap", params: { ... } } using param names from project_actions. side sell = spend base for quote (e.g. SUI→USDC); side buy = spend quote for base. Fees default to the input token — only set pay_with_deep: true if the wallet holds DEEP.',
  ];
}
