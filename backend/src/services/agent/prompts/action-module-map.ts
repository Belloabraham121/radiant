import {
  classifyExecuteAction,
  type ExecuteActionClass,
} from "../deepbook/classify-execute-action.js";
import type { PromptModuleId } from "./types.js";

const DEEPBOOK_ENV: PromptModuleId = "protocol:deepbook:env";

const DEEPBOOK_BASE: PromptModuleId[] = [DEEPBOOK_ENV];

/** Default optional modules per execute action class (excludes always-on core modules). */
const EXECUTE_CLASS_PROMPT_MODULES: Record<ExecuteActionClass, PromptModuleId[]> = {
  transfer: [],
  swap: [...DEEPBOOK_BASE, "protocol:deepbook:swap"],
  order: [...DEEPBOOK_BASE, "protocol:deepbook:balance", "protocol:deepbook:orders"],
  cancel: [...DEEPBOOK_BASE, "protocol:deepbook:orders"],
  modify: [...DEEPBOOK_BASE, "protocol:deepbook:orders"],
  balance: [...DEEPBOOK_BASE, "protocol:deepbook:balance"],
  provision: [...DEEPBOOK_BASE, "protocol:deepbook:balance"],
  settled: [...DEEPBOOK_BASE, "protocol:deepbook:orders"],
  flash_loan: [...DEEPBOOK_BASE, "protocol:deepbook:flash-loan"],
  stake: [...DEEPBOOK_BASE, "protocol:deepbook:stake"],
  governance: [...DEEPBOOK_BASE, "protocol:deepbook:governance"],
  margin: [...DEEPBOOK_BASE, "protocol:deepbook:margin"],
  predict: [...DEEPBOOK_BASE, "protocol:deepbook:predict"],
  other: [],
};

const PREDICT_EXECUTE_PREFIX = "deepbook_predict_";

export const DEEPBOOK_MARGIN_EXECUTE_ACTIONS = [
  "deepbook_provision_margin_manager",
  "deepbook_margin_deposit",
  "deepbook_margin_withdraw",
  "deepbook_margin_borrow",
  "deepbook_margin_repay",
  "deepbook_margin_place_limit_order",
  "deepbook_margin_place_market_order",
  "deepbook_margin_place_reduce_only_limit_order",
  "deepbook_margin_place_reduce_only_market_order",
  "deepbook_margin_cancel_order",
  "deepbook_margin_cancel_orders",
  "deepbook_margin_cancel_all_orders",
  "deepbook_margin_modify_order",
  "deepbook_margin_withdraw_settled",
  "deepbook_margin_withdraw_settled_permissionless",
  "deepbook_margin_update_price",
  "deepbook_margin_tpsl_add",
  "deepbook_margin_tpsl_cancel",
  "deepbook_margin_tpsl_cancel_all",
  "deepbook_margin_tpsl_execute",
] as const;

export const DEEPBOOK_PREDICT_EXECUTE_ACTIONS = [
  "deepbook_predict_deposit",
  "deepbook_predict_withdraw",
  "deepbook_predict_mint",
  "deepbook_predict_redeem",
  "deepbook_predict_mint_range",
  "deepbook_predict_redeem_range",
  "deepbook_predict_supply",
  "deepbook_predict_lp_withdraw",
] as const;

function isMarginExecuteAction(action: string): boolean {
  return (
    action === "deepbook_provision_margin_manager" ||
    action.startsWith("deepbook_margin_")
  );
}

function isPredictExecuteAction(action: string): boolean {
  return action.startsWith(PREDICT_EXECUTE_PREFIX);
}

/** Optional prompt modules for a single execute_transaction action (core modules omitted). */
export function resolvePromptModulesForExecuteAction(action: string): PromptModuleId[] {
  if (action === "cross_chain_swap" || action === "lifi_approve") {
    return ["protocol:lifi:env", "protocol:lifi:bridge", "protocol:lifi:swap"];
  }
  if (action === "stellar_swap") {
    return ["protocol:soroswap:env", "protocol:soroswap:swap"];
  }
  if (isMarginExecuteAction(action)) {
    return EXECUTE_CLASS_PROMPT_MODULES.margin;
  }
  if (isPredictExecuteAction(action)) {
    return EXECUTE_CLASS_PROMPT_MODULES.predict;
  }
  return EXECUTE_CLASS_PROMPT_MODULES[classifyExecuteAction(action)] ?? [];
}

/** query_chain type → optional prompt modules (core modules omitted). */
export const QUERY_TYPE_PROMPT_MODULES: Readonly<Record<string, readonly PromptModuleId[]>> = {
  deepbook_pools: DEEPBOOK_BASE,
  deepbook_pool_info: DEEPBOOK_BASE,
  deepbook_ticker: DEEPBOOK_BASE,
  deepbook_trades: DEEPBOOK_BASE,
  deepbook_volume: DEEPBOOK_BASE,
  deepbook_ohlcv: DEEPBOOK_BASE,
  deepbook_manager_info: [...DEEPBOOK_BASE, "protocol:deepbook:balance"],
  deepbook_manager_balance: [...DEEPBOOK_BASE, "protocol:deepbook:balance"],
  swap_quote: [...DEEPBOOK_BASE, "protocol:deepbook:swap"],
  flash_loan_quote: [...DEEPBOOK_BASE, "protocol:deepbook:flash-loan"],
  deepbook_open_orders: [...DEEPBOOK_BASE, "protocol:deepbook:balance", "protocol:deepbook:orders"],
  deepbook_stake_balance: [...DEEPBOOK_BASE, "protocol:deepbook:stake"],
  deepbook_stake_required: [...DEEPBOOK_BASE, "protocol:deepbook:stake"],
  deepbook_governance_state: [...DEEPBOOK_BASE, "protocol:deepbook:governance"],
  margin_pool_info: EXECUTE_CLASS_PROMPT_MODULES.margin,
  margin_manager_info: EXECUTE_CLASS_PROMPT_MODULES.margin,
  margin_tpsl_info: EXECUTE_CLASS_PROMPT_MODULES.margin,
  margin_open_orders: EXECUTE_CLASS_PROMPT_MODULES.margin,
  margin_liquidations: EXECUTE_CLASS_PROMPT_MODULES.margin,
  margin_collateral_history: EXECUTE_CLASS_PROMPT_MODULES.margin,
  margin_loan_history: EXECUTE_CLASS_PROMPT_MODULES.margin,
  margin_at_risk_states: EXECUTE_CLASS_PROMPT_MODULES.margin,
  margin_managers_info: EXECUTE_CLASS_PROMPT_MODULES.margin,
  margin_manager_created: EXECUTE_CLASS_PROMPT_MODULES.margin,
  margin_supply_history: EXECUTE_CLASS_PROMPT_MODULES.margin,
  margin_indexer_supply: EXECUTE_CLASS_PROMPT_MODULES.margin,
  margin_manager_state: EXECUTE_CLASS_PROMPT_MODULES.margin,
  predict_markets: EXECUTE_CLASS_PROMPT_MODULES.predict,
  predict_trade_amounts: EXECUTE_CLASS_PROMPT_MODULES.predict,
  predict_range_amounts: EXECUTE_CLASS_PROMPT_MODULES.predict,
  predict_manager_info: EXECUTE_CLASS_PROMPT_MODULES.predict,
  predict_vault_summary: EXECUTE_CLASS_PROMPT_MODULES.predict,
  cross_chain_quote: ["protocol:lifi:env", "protocol:lifi:bridge"],
  cross_chain_routes: ["protocol:lifi:env", "protocol:lifi:bridge"],
  cross_chain_connections: ["protocol:lifi:env", "protocol:lifi:bridge"],
  cross_chain_status: ["protocol:lifi:env", "protocol:lifi:bridge"],
  stellar_swap_quote: ["protocol:soroswap:env", "protocol:soroswap:swap"],
  project_actions: ["artifact:build", "artifact:defi-ui"],
  session_actions: ["artifact:build", "artifact:defi-ui"],
  project_notification_schema: ["platform:notifications"],
};

/** Optional prompt modules for a query_chain query type. */
export function resolvePromptModulesForQueryType(query: string): PromptModuleId[] {
  return [...(QUERY_TYPE_PROMPT_MODULES[query] ?? [])];
}

/** Union of modules referenced by execute and query maps — for validation tests. */
export function listMappedPromptModuleIds(): PromptModuleId[] {
  const ids = new Set<PromptModuleId>();
  for (const modules of Object.values(EXECUTE_CLASS_PROMPT_MODULES)) {
    for (const id of modules) {
      ids.add(id);
    }
  }
  for (const modules of Object.values(QUERY_TYPE_PROMPT_MODULES)) {
    for (const id of modules) {
      ids.add(id);
    }
  }
  return [...ids];
}
