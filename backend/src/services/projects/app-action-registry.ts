import { getDefaultAgentChainId } from "../../config/chains.js";
import { categorizeAgentTransactionAction } from "../agent-transaction/deepbook/categorize-action.js";
import {
  APP_ACTION_NAMES,
  type AppActionDefinition,
  type AppActionName,
} from "./app-action.types.js";
import { appActionParamSchemaDocs } from "./app-action-param-schemas.js";

export { APP_ACTION_NAMES } from "./app-action.types.js";
export type { AppActionName, AppActionDefinition } from "./app-action.types.js";

const DEFAULT_CHAIN = getDefaultAgentChainId();

function defineAction(
  input: Omit<AppActionDefinition, "category"> & { category?: AppActionDefinition["category"] },
): AppActionDefinition {
  return {
    ...input,
    category: input.category ?? categorizeAgentTransactionAction(input.execute_action),
  };
}

/** Canonical registry of app-facing actions → execute_transaction mapping. */
export const APP_ACTION_REGISTRY: Record<AppActionName, AppActionDefinition> = {
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
};

export function isAppActionName(value: string): value is AppActionName {
  return (APP_ACTION_NAMES as readonly string[]).includes(value);
}

export function getAppActionDefinition(name: AppActionName): AppActionDefinition {
  return APP_ACTION_REGISTRY[name];
}

export function listAppActionDefinitions(): AppActionDefinition[] {
  return APP_ACTION_NAMES.map((name) => APP_ACTION_REGISTRY[name]);
}

/** Param schema docs keyed by action — for GET .../actions and Phase 6 storage. */
export function getAppActionParamSchemaDoc(name: AppActionName) {
  return appActionParamSchemaDocs[name];
}
