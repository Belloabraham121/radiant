import {
  PREDICT_TESTNET_CONFIG,
  type PredictMintParams,
  type PredictRedeemParams,
  type PredictMintRangeParams,
  type PredictRedeemRangeParams,
  type PredictSupplyParams,
  type PredictLPWithdrawParams,
  type PredictDepositParams,
  type PredictWithdrawParams,
} from "./deepbook-predict.types.js";

const PREDICT_ACTIONS = new Set([
  "deepbook_predict_deposit",
  "deepbook_predict_withdraw",
  "deepbook_predict_mint",
  "deepbook_predict_redeem",
  "deepbook_predict_mint_range",
  "deepbook_predict_redeem_range",
  "deepbook_predict_supply",
  "deepbook_predict_lp_withdraw",
]);

export function isDeepBookPredictAction(action: string): boolean {
  return PREDICT_ACTIONS.has(action);
}

/**
 * Build summary text for a predict action (used in pending approval display).
 */
export function buildPredictActionSummary(
  action: string,
  params: Record<string, unknown>,
): string {
  switch (action) {
    case "deepbook_predict_deposit":
      return `Deposit ${params.amount} into Predict manager`;
    case "deepbook_predict_withdraw":
      return `Withdraw ${params.amount} from Predict manager`;
    case "deepbook_predict_mint": {
      const direction = params.is_up ? "UP" : "DOWN";
      return `Mint ${params.quantity} ${direction} position @ strike ${params.strike}`;
    }
    case "deepbook_predict_redeem": {
      const direction = params.is_up ? "UP" : "DOWN";
      return `Redeem ${params.quantity} ${direction} position @ strike ${params.strike}`;
    }
    case "deepbook_predict_mint_range":
      return `Mint ${params.quantity} range [${params.lower_strike}–${params.higher_strike}]`;
    case "deepbook_predict_redeem_range":
      return `Redeem ${params.quantity} range [${params.lower_strike}–${params.higher_strike}]`;
    case "deepbook_predict_supply":
      return `Supply ${params.amount} to Predict vault (receive PLP)`;
    case "deepbook_predict_lp_withdraw":
      return `Withdraw from Predict vault (burn ${params.plp_amount} PLP)`;
    default:
      return `Predict action: ${action}`;
  }
}

/**
 * Get the default quote asset for Predict (currently DUSDC on testnet).
 */
export function getDefaultPredictQuoteAsset(): string {
  return PREDICT_TESTNET_CONFIG.quoteAsset;
}

/**
 * Get the current Predict object ID.
 */
export function getPredictObjectId(): string {
  return PREDICT_TESTNET_CONFIG.predictObject;
}
