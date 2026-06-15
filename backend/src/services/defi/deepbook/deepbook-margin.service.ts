import type {
  MarginManagerState,
  MarginPoolState,
  MarginDepositParams,
  MarginBorrowParams,
  MarginRepayParams,
  MarginSupplyPoolParams,
  MarginWithdrawPoolParams,
} from "./deepbook-margin.types.js";

const MARGIN_ACTIONS = new Set([
  "deepbook_margin_deposit",
  "deepbook_margin_withdraw",
  "deepbook_margin_borrow",
  "deepbook_margin_repay",
  "deepbook_margin_place_limit_order",
  "deepbook_margin_place_market_order",
  "deepbook_margin_cancel_order",
  "deepbook_margin_modify_order",
  "deepbook_margin_supply_pool",
  "deepbook_margin_withdraw_pool",
]);

export function isDeepBookMarginAction(action: string): boolean {
  return MARGIN_ACTIONS.has(action);
}

/**
 * Build summary text for a margin action (used in pending approval display).
 */
export function buildMarginActionSummary(
  action: string,
  params: Record<string, unknown>,
): string {
  const managerKey = String(params.margin_manager_key ?? params.marginManagerKey ?? "");
  switch (action) {
    case "deepbook_margin_deposit":
      return `Deposit ${params.amount} ${params.coin_type ?? "tokens"} into margin manager`;
    case "deepbook_margin_withdraw":
      return `Withdraw ${params.amount} ${params.coin_type ?? "tokens"} from margin manager`;
    case "deepbook_margin_borrow":
      return `Borrow ${params.amount} ${params.asset ?? "tokens"} from margin pool`;
    case "deepbook_margin_repay":
      return params.amount
        ? `Repay ${params.amount} ${params.asset ?? "tokens"} to margin pool`
        : `Repay all ${params.asset ?? "tokens"} to margin pool`;
    case "deepbook_margin_place_limit_order":
      return `Place margin limit order: ${params.is_bid ? "buy" : "sell"} ${params.quantity} @ ${params.price}`;
    case "deepbook_margin_place_market_order":
      return `Place margin market order: ${params.is_bid ? "buy" : "sell"} ${params.quantity}`;
    case "deepbook_margin_cancel_order":
      return `Cancel margin order ${params.order_id}`;
    case "deepbook_margin_modify_order":
      return `Modify margin order ${params.order_id} → qty ${params.new_quantity}`;
    case "deepbook_margin_supply_pool":
      return `Supply ${params.amount} ${params.coin_type ?? ""} to margin pool`;
    case "deepbook_margin_withdraw_pool":
      return params.amount
        ? `Withdraw ${params.amount} ${params.coin_type ?? ""} from margin pool`
        : `Withdraw all from margin pool`;
    default:
      return `Margin action: ${action}`;
  }
}

/**
 * Margin pool states used in SUI_DBUSDC, WAL_DBUSDC, DEEP_DBUSDC.
 * Max leverage: SUI/USDC = 5x, WAL/USDC and DEEP/USDC = 3x.
 */
export const MARGIN_POOL_CONFIGS: Record<
  string,
  { maxLeverage: number; liquidationRatio: number; borrowThreshold: number }
> = {
  SUI_DBUSDC: { maxLeverage: 5, liquidationRatio: 1.1, borrowThreshold: 1.25 },
  WAL_DBUSDC: { maxLeverage: 3, liquidationRatio: 1.2, borrowThreshold: 1.3 },
  DEEP_DBUSDC: { maxLeverage: 3, liquidationRatio: 1.2, borrowThreshold: 1.3 },
};

export function getMaxLeverage(poolKey: string): number {
  return MARGIN_POOL_CONFIGS[poolKey]?.maxLeverage ?? 3;
}

export function getLiquidationThreshold(poolKey: string): number {
  return MARGIN_POOL_CONFIGS[poolKey]?.liquidationRatio ?? 1.2;
}
