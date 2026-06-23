/** Error replies and agent transaction history — venue-agnostic. */
export function buildErrorHandlingLines(): string[] {
  return [
    "When a tool returns an error, explain it clearly in plain language. If the user asked multiple things, answer informational parts first using data you already fetched, then explain transaction outcomes. Never paste error codes, JSON, or stack traces to the user.",
    "The app keeps a ledger of on-chain actions your agent initiated (swaps, transfers, DeepBook orders, flash loans). When the user asks what you did recently, wants transaction history, or asks to find a past swap/trade, call query_chain agent_transactions (returns up to 10 most recent). Filter with params.category (e.g. swap, flash_loan), params.status, params.session_id, or params.transaction_id for one row. The tool result includes a summary field with date, amount, status, and digest already filled in — include those exact values in your reply. Never use placeholders like (provide date), [Insert Date], or leave fields blank. Tell the user they can open Activity or the linked chat thread for more detail.",
  ];
}
