import { getDefaultAgentChainId } from "../../config/chains.js";
import { categorizeAgentTransactionAction } from "../agent-transaction/deepbook/categorize-action.js";
import {
  APP_ACTION_NAMES,
  ONCHAIN_ACTION_NAMES,
  isOnchainAction,
  type AppActionDefinition,
  type AppActionName,
  type OnchainActionName,
} from "./app-action.types.js";
import { appActionParamSchemaDocs } from "./app-action-param-schemas.js";

export { APP_ACTION_NAMES, ONCHAIN_ACTION_NAMES, isOnchainAction } from "./app-action.types.js";
export type { AppActionName, OnchainActionName, AppActionDefinition } from "./app-action.types.js";

const DEFAULT_CHAIN = getDefaultAgentChainId();

function defineAction(
  input: Omit<AppActionDefinition, "category"> & { category?: AppActionDefinition["category"] },
): AppActionDefinition {
  return {
    ...input,
    category: input.category ?? categorizeAgentTransactionAction(input.execute_action),
  };
}

/** Canonical registry of on-chain actions → execute_transaction mapping. */
export const APP_ACTION_REGISTRY: Record<OnchainActionName, AppActionDefinition> = {
  swap: defineAction({
    name: "swap",
    description: "Swap tokens on DeepBook using the agent wallet.",
    protocol: "deepbook",
    default_chain_id: "sui",
    execute_action: "swap",
  }),
  flash_loan: defineAction({
    name: "flash_loan",
    description: "Execute an atomic DeepBook flash loan bundle.",
    protocol: "deepbook",
    default_chain_id: "sui",
    execute_action: "deepbook_flash_loan",
  }),
  stake: defineAction({
    name: "stake",
    description: "Stake DEEP from the balance manager into a DeepBook pool.",
    protocol: "deepbook",
    default_chain_id: "sui",
    execute_action: "deepbook_stake",
  }),
  unstake: defineAction({
    name: "unstake",
    description: "Unstake DEEP from a DeepBook pool back to the balance manager.",
    protocol: "deepbook",
    default_chain_id: "sui",
    execute_action: "deepbook_unstake",
  }),
  deposit: defineAction({
    name: "deposit",
    description: "Deposit tokens from the agent wallet into the DeepBook balance manager.",
    protocol: "deepbook",
    default_chain_id: "sui",
    execute_action: "deepbook_deposit",
  }),
  withdraw: defineAction({
    name: "withdraw",
    description: "Withdraw tokens from the DeepBook balance manager to the agent wallet.",
    protocol: "deepbook",
    default_chain_id: "sui",
    execute_action: "deepbook_withdraw",
  }),
  provision_manager: defineAction({
    name: "provision_manager",
    description: "Create the on-chain DeepBook balance manager (gas only).",
    protocol: "deepbook",
    default_chain_id: "sui",
    execute_action: "deepbook_provision_manager",
  }),
  place_limit_order: defineAction({
    name: "place_limit_order",
    description: "Place a limit order on the DeepBook order book.",
    protocol: "deepbook",
    default_chain_id: "sui",
    execute_action: "deepbook_place_limit_order",
  }),
  place_market_order: defineAction({
    name: "place_market_order",
    description: "Place a market order on the DeepBook order book.",
    protocol: "deepbook",
    default_chain_id: "sui",
    execute_action: "deepbook_place_market_order",
  }),
  cancel_order: defineAction({
    name: "cancel_order",
    description: "Cancel one open DeepBook order.",
    protocol: "deepbook",
    default_chain_id: "sui",
    execute_action: "deepbook_cancel_order",
  }),
  cancel_orders: defineAction({
    name: "cancel_orders",
    description: "Cancel multiple open DeepBook orders.",
    protocol: "deepbook",
    default_chain_id: "sui",
    execute_action: "deepbook_cancel_orders",
  }),
  cancel_all_orders: defineAction({
    name: "cancel_all_orders",
    description: "Cancel all open orders on a DeepBook pool.",
    protocol: "deepbook",
    default_chain_id: "sui",
    execute_action: "deepbook_cancel_all_orders",
  }),
  modify_order: defineAction({
    name: "modify_order",
    description: "Modify quantity of an open DeepBook limit order.",
    protocol: "deepbook",
    default_chain_id: "sui",
    execute_action: "deepbook_modify_order",
  }),
  withdraw_settled: defineAction({
    name: "withdraw_settled",
    description: "Claim settled proceeds from filled DeepBook orders.",
    protocol: "deepbook",
    default_chain_id: "sui",
    execute_action: "deepbook_withdraw_settled_amounts",
  }),
  submit_proposal: defineAction({
    name: "submit_proposal",
    description: "Submit a DeepBook governance proposal for next-epoch fees.",
    protocol: "deepbook",
    default_chain_id: "sui",
    execute_action: "deepbook_submit_proposal",
  }),
  vote: defineAction({
    name: "vote",
    description: "Vote on a DeepBook governance proposal.",
    protocol: "deepbook",
    default_chain_id: "sui",
    execute_action: "deepbook_vote",
  }),
  transfer: defineAction({
    name: "transfer",
    description: "Transfer native tokens from the agent wallet.",
    protocol: "transfer",
    default_chain_id: DEFAULT_CHAIN,
    execute_action: "transfer_native",
  }),
  // DeepBook Margin
  margin_deposit: defineAction({
    name: "margin_deposit",
    description: "Deposit collateral into a DeepBook margin manager.",
    protocol: "deepbook",
    default_chain_id: "sui",
    execute_action: "deepbook_margin_deposit",
  }),
  margin_withdraw: defineAction({
    name: "margin_withdraw",
    description: "Withdraw collateral from a DeepBook margin manager.",
    protocol: "deepbook",
    default_chain_id: "sui",
    execute_action: "deepbook_margin_withdraw",
  }),
  margin_borrow: defineAction({
    name: "margin_borrow",
    description: "Borrow assets from a DeepBook margin pool to increase leverage.",
    protocol: "deepbook",
    default_chain_id: "sui",
    execute_action: "deepbook_margin_borrow",
  }),
  margin_repay: defineAction({
    name: "margin_repay",
    description: "Repay borrowed assets to a DeepBook margin pool.",
    protocol: "deepbook",
    default_chain_id: "sui",
    execute_action: "deepbook_margin_repay",
  }),
  margin_place_limit_order: defineAction({
    name: "margin_place_limit_order",
    description: "Place a leveraged limit order through a DeepBook margin manager.",
    protocol: "deepbook",
    default_chain_id: "sui",
    execute_action: "deepbook_margin_place_limit_order",
  }),
  margin_place_market_order: defineAction({
    name: "margin_place_market_order",
    description: "Place a leveraged market order through a DeepBook margin manager.",
    protocol: "deepbook",
    default_chain_id: "sui",
    execute_action: "deepbook_margin_place_market_order",
  }),
  margin_cancel_order: defineAction({
    name: "margin_cancel_order",
    description: "Cancel an open margin order on DeepBook.",
    protocol: "deepbook",
    default_chain_id: "sui",
    execute_action: "deepbook_margin_cancel_order",
  }),
  margin_modify_order: defineAction({
    name: "margin_modify_order",
    description: "Modify quantity of an open margin order on DeepBook.",
    protocol: "deepbook",
    default_chain_id: "sui",
    execute_action: "deepbook_margin_modify_order",
  }),
  margin_place_reduce_only_limit_order: defineAction({
    name: "margin_place_reduce_only_limit_order",
    description: "Place a reduce-only limit order through a DeepBook margin manager.",
    protocol: "deepbook",
    default_chain_id: "sui",
    execute_action: "deepbook_margin_place_reduce_only_limit_order",
  }),
  margin_place_reduce_only_market_order: defineAction({
    name: "margin_place_reduce_only_market_order",
    description: "Place a reduce-only market order through a DeepBook margin manager.",
    protocol: "deepbook",
    default_chain_id: "sui",
    execute_action: "deepbook_margin_place_reduce_only_market_order",
  }),
  margin_cancel_orders: defineAction({
    name: "margin_cancel_orders",
    description: "Cancel multiple open margin orders on DeepBook.",
    protocol: "deepbook",
    default_chain_id: "sui",
    execute_action: "deepbook_margin_cancel_orders",
  }),
  margin_cancel_all_orders: defineAction({
    name: "margin_cancel_all_orders",
    description: "Cancel all open margin orders on DeepBook.",
    protocol: "deepbook",
    default_chain_id: "sui",
    execute_action: "deepbook_margin_cancel_all_orders",
  }),
  margin_withdraw_settled: defineAction({
    name: "margin_withdraw_settled",
    description: "Withdraw settled trade proceeds from a margin manager.",
    protocol: "deepbook",
    default_chain_id: "sui",
    execute_action: "deepbook_margin_withdraw_settled",
  }),
  margin_withdraw_settled_permissionless: defineAction({
    name: "margin_withdraw_settled_permissionless",
    description: "Permissionlessly withdraw settled amounts from a margin manager.",
    protocol: "deepbook",
    default_chain_id: "sui",
    execute_action: "deepbook_margin_withdraw_settled_permissionless",
  }),
  margin_update_price: defineAction({
    name: "margin_update_price",
    description: "Refresh the Pyth oracle price for a margin-enabled DeepBook pool.",
    protocol: "deepbook",
    default_chain_id: "sui",
    execute_action: "deepbook_margin_update_price",
  }),
  margin_supply_pool: defineAction({
    name: "margin_supply_pool",
    description: "Supply liquidity to a DeepBook margin pool to earn interest.",
    protocol: "deepbook",
    default_chain_id: "sui",
    execute_action: "deepbook_margin_supply_pool",
  }),
  margin_withdraw_pool: defineAction({
    name: "margin_withdraw_pool",
    description: "Withdraw supplied liquidity from a DeepBook margin pool.",
    protocol: "deepbook",
    default_chain_id: "sui",
    execute_action: "deepbook_margin_withdraw_pool",
  }),
  margin_tpsl_add: defineAction({
    name: "margin_tpsl_add",
    description: "Add a take-profit or stop-loss conditional order on a margin manager.",
    protocol: "deepbook",
    default_chain_id: "sui",
    execute_action: "deepbook_margin_tpsl_add",
  }),
  margin_tpsl_cancel: defineAction({
    name: "margin_tpsl_cancel",
    description: "Cancel one margin TPSL conditional order.",
    protocol: "deepbook",
    default_chain_id: "sui",
    execute_action: "deepbook_margin_tpsl_cancel",
  }),
  margin_tpsl_cancel_all: defineAction({
    name: "margin_tpsl_cancel_all",
    description: "Cancel all margin TPSL conditional orders.",
    protocol: "deepbook",
    default_chain_id: "sui",
    execute_action: "deepbook_margin_tpsl_cancel_all",
  }),
  // DeepBook Predict
  predict_deposit: defineAction({
    name: "predict_deposit",
    description: "Deposit quote assets into a DeepBook Predict manager.",
    protocol: "deepbook",
    default_chain_id: "sui",
    execute_action: "deepbook_predict_deposit",
  }),
  predict_withdraw: defineAction({
    name: "predict_withdraw",
    description: "Withdraw quote assets from a DeepBook Predict manager.",
    protocol: "deepbook",
    default_chain_id: "sui",
    execute_action: "deepbook_predict_withdraw",
  }),
  predict_mint: defineAction({
    name: "predict_mint",
    description: "Mint a binary prediction position (UP or DOWN on a strike price).",
    protocol: "deepbook",
    default_chain_id: "sui",
    execute_action: "deepbook_predict_mint",
  }),
  predict_redeem: defineAction({
    name: "predict_redeem",
    description: "Redeem (sell) a binary prediction position.",
    protocol: "deepbook",
    default_chain_id: "sui",
    execute_action: "deepbook_predict_redeem",
  }),
  predict_mint_range: defineAction({
    name: "predict_mint_range",
    description: "Mint a vertical range prediction position (price within a band).",
    protocol: "deepbook",
    default_chain_id: "sui",
    execute_action: "deepbook_predict_mint_range",
  }),
  predict_redeem_range: defineAction({
    name: "predict_redeem_range",
    description: "Redeem (sell) a vertical range prediction position.",
    protocol: "deepbook",
    default_chain_id: "sui",
    execute_action: "deepbook_predict_redeem_range",
  }),
  predict_supply: defineAction({
    name: "predict_supply",
    description: "Supply quote assets to the Predict vault and receive PLP shares.",
    protocol: "deepbook",
    default_chain_id: "sui",
    execute_action: "deepbook_predict_supply",
  }),
  predict_lp_withdraw: defineAction({
    name: "predict_lp_withdraw",
    description: "Burn PLP shares and withdraw quote assets from the Predict vault.",
    protocol: "deepbook",
    default_chain_id: "sui",
    execute_action: "deepbook_predict_lp_withdraw",
  }),
};

export function isAppActionName(value: string): value is AppActionName {
  return value.length > 0;
}

export function getAppActionDefinition(name: AppActionName): AppActionDefinition {
  if (!isOnchainAction(name)) {
    return {
      name,
      description: `App-local action: ${name}`,
      protocol: "generic",
      default_chain_id: "sui",
      execute_action: name,
      category: "other" as AppActionDefinition["category"],
    };
  }
  return APP_ACTION_REGISTRY[name];
}

export function listAppActionDefinitions(): AppActionDefinition[] {
  return ONCHAIN_ACTION_NAMES.map((name) => APP_ACTION_REGISTRY[name]);
}

/** Param schema docs keyed by action — for GET .../actions and Phase 6 storage. */
export function getAppActionParamSchemaDoc(name: AppActionName) {
  if (!isOnchainAction(name)) {
    return { fields: [] };
  }
  return appActionParamSchemaDocs[name];
}
