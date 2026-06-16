import type {
  MarginLimitOrderParams,
  MarginMarketOrderParams,
} from "./deepbook-margin.types.js";

/**
 * Margin order actions — these build PTBs (programmable transaction blocks)
 * that route orders through the MarginManager on DeepBook.
 *
 * Uses the @mysten/deepbook-v3 SDK's pool.marginPlaceLimitOrder /
 * pool.marginPlaceMarketOrder when available.
 */

export function buildMarginLimitOrderTxParams(params: MarginLimitOrderParams): Record<string, unknown> {
  return {
    pool_key: params.poolKey,
    margin_manager_key: params.marginManagerKey,
    price: params.price,
    quantity: params.quantity,
    is_bid: params.isBid,
    pay_with_deep: params.payWithDeep ?? false,
    client_order_id: params.clientOrderId,
    expiration: params.expiration,
    order_type: params.orderType ?? "no_restriction",
  };
}

export function buildMarginMarketOrderTxParams(params: MarginMarketOrderParams): Record<string, unknown> {
  return {
    pool_key: params.poolKey,
    margin_manager_key: params.marginManagerKey,
    quantity: params.quantity,
    is_bid: params.isBid,
    pay_with_deep: params.payWithDeep ?? false,
    client_order_id: params.clientOrderId,
  };
}

export function buildMarginCancelOrderTxParams(marginManagerKey: string, orderId: string): Record<string, unknown> {
  return {
    margin_manager_key: marginManagerKey,
    order_id: orderId,
  };
}

export function buildMarginModifyOrderTxParams(
  marginManagerKey: string,
  orderId: string,
  newQuantity: number,
): Record<string, unknown> {
  return {
    margin_manager_key: marginManagerKey,
    order_id: orderId,
    new_quantity: newQuantity,
  };
}

/** Validate that a margin order won't obviously violate risk ratio. */
export function estimatePostOrderRiskRatio(
  currentRiskRatio: number | null,
  collateralValue: number,
  additionalBorrow: number,
): number | null {
  if (currentRiskRatio == null || collateralValue === 0) return null;
  const currentDebt = collateralValue / (currentRiskRatio || 1) - collateralValue;
  const newDebt = currentDebt + additionalBorrow;
  if (newDebt <= 0) return null;
  return collateralValue / newDebt;
}
