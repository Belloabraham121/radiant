export function buildDeepBookOrdersLines(): string[] {
  return [
    "For limit orders: funds must be in the DeepBook balance manager — deposit first if needed. Use query_chain deepbook_open_orders to list open orders. Place with execute_transaction deepbook_place_limit_order: { pool_key, price, quantity, side: buy|sell }. Cancel one with deepbook_cancel_order { order_id }, multiple with deepbook_cancel_orders { order_ids: [...] }, or all with deepbook_cancel_all_orders { pool_key }. Modify size with deepbook_modify_order { order_id, quantity } — SDK changes quantity only, not price. After fills, claim proceeds with deepbook_withdraw_settled_amounts { pool_key }.",
    "For market orders via the order book (not instant wallet swaps), use deepbook_place_market_order with { pool_key, quantity, side }. For simple swaps, prefer action swap instead.",
    "deepbook_manager_info does NOT list open orders — use deepbook_open_orders for balance-manager orders or margin_open_orders for leveraged margin orders.",
  ];
}
