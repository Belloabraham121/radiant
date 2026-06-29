import type { PromptModuleId, PromptTrigger } from "./types.js";
import {
  DEEPBOOK_MARGIN_EXECUTE_ACTIONS,
  DEEPBOOK_PREDICT_EXECUTE_ACTIONS,
} from "./action-module-map.js";

/** Keyword / tool triggers for scoped prompt resolution (Phase 4). Core modules are always-on. */
export const PROMPT_MODULE_TRIGGERS: Partial<Record<PromptModuleId, PromptTrigger>> = {
  "protocol:deepbook:env": {
    queryTypes: [
      "deepbook_pools",
      "deepbook_pool_info",
      "deepbook_ticker",
      "deepbook_trades",
      "deepbook_volume",
      "deepbook_ohlcv",
    ],
    keywords: [/\bdeepbook\b/i, /\bpool_key\b/i, /SUI_USDC/i],
    chains: ["sui"],
  },
  "protocol:deepbook:balance": {
    executeActions: [
      "deepbook_provision_manager",
      "deepbook_deposit",
      "deepbook_withdraw",
    ],
    queryTypes: ["deepbook_manager_info", "deepbook_manager_balance"],
    keywords: [/\bdeposit\b/i, /\bwithdraw\b/i, /balance manager/i],
    chains: ["sui"],
  },
  "protocol:deepbook:swap": {
    executeActions: ["swap", "deepbook_swap"],
    queryTypes: ["swap_quote"],
    keywords: [/\bswap\b/i, /swap_quote/],
    chains: ["sui"],
  },
  "protocol:deepbook:orders": {
    executeActions: [
      "deepbook_place_limit_order",
      "deepbook_place_market_order",
      "deepbook_cancel_order",
      "deepbook_cancel_orders",
      "deepbook_cancel_all_orders",
      "deepbook_modify_order",
      "deepbook_withdraw_settled_amounts",
      "deepbook_withdraw_settled_amounts_permissionless",
    ],
    queryTypes: ["deepbook_open_orders"],
    keywords: [/\blimit order\b/i, /\bmarket order\b/i, /open orders/i],
    chains: ["sui"],
  },
  "protocol:deepbook:flash-loan": {
    executeActions: ["deepbook_flash_loan"],
    queryTypes: ["flash_loan_quote"],
    keywords: [/flash[\s-]?loan/i, /flash_loan_quote/],
    requiresPermission: "allow_flash_loans",
    chains: ["sui"],
  },
  "protocol:deepbook:stake": {
    executeActions: ["deepbook_stake", "deepbook_unstake"],
    queryTypes: ["deepbook_stake_balance", "deepbook_stake_required"],
    keywords: [/\bstake\b/i, /\bunstake\b/i, /\bDEEP\b/],
    chains: ["sui"],
  },
  "protocol:deepbook:governance": {
    executeActions: ["deepbook_submit_proposal", "deepbook_vote"],
    queryTypes: ["deepbook_governance_state"],
    keywords: [/\bgovernance\b/i, /\bproposal\b/i, /\bvote\b/i],
    requiresPermission: "allow_governance",
    chains: ["sui"],
  },
  "protocol:deepbook:margin": {
    executeActions: [...DEEPBOOK_MARGIN_EXECUTE_ACTIONS],
    queryTypes: [
      "margin_pool_info",
      "margin_manager_info",
      "margin_tpsl_info",
      "margin_open_orders",
      "margin_liquidations",
      "margin_collateral_history",
      "margin_loan_history",
      "margin_at_risk_states",
      "margin_managers_info",
      "margin_manager_created",
      "margin_supply_history",
      "margin_indexer_supply",
      "margin_manager_state",
    ],
    keywords: [/\bmargin\b/i, /leverage/i, /margin_manager/i],
    chains: ["sui"],
  },
  "protocol:deepbook:predict": {
    executeActions: [...DEEPBOOK_PREDICT_EXECUTE_ACTIONS],
    queryTypes: [
      "predict_markets",
      "predict_trade_amounts",
      "predict_range_amounts",
      "predict_manager_info",
      "predict_vault_summary",
    ],
    keywords: [/\bpredict\b/i, /\bPLP\b/i, /prediction market/i],
    chains: ["sui"],
  },
  "platform:browsing": {
    keywords: [/\bweb_search\b/i, /\bbrowse_webpage\b/i, /\bcall_api\b/i, /search the web/i],
  },
  "platform:notifications": {
    keywords: [/createNotificationRule/i, /remind me/i, /notification/i],
  },
  "protocol:lifi:env": {
    queryTypes: ["cross_chain_quote", "cross_chain_routes", "cross_chain_connections", "cross_chain_status"],
    keywords: [/\bbridge\b/i, /cross[- ]?chain/i, /\blifi\b/i, /\bjumper\b/i],
    chains: ["ethereum"],
  },
  "protocol:lifi:swap": {
    executeActions: ["cross_chain_swap", "lifi_approve"],
    queryTypes: ["cross_chain_quote", "cross_chain_routes"],
    keywords: [/\bbridge\b/i, /cross[- ]?chain/i],
    chains: ["ethereum"],
  },
  "protocol:lifi:bridge": {
    executeActions: ["cross_chain_swap", "lifi_approve"],
    queryTypes: ["cross_chain_quote", "cross_chain_routes", "cross_chain_status", "cross_chain_connections"],
    keywords: [/\bbridge\b/i, /arbitrum/i, /\bbase\b/i, /ethereum.*arbitrum/i],
    chains: ["ethereum"],
  },
  "protocol:cross-chain:fallback": {
    queryTypes: ["cross_chain_quote", "cross_chain_routes"],
    keywords: [
      /\bliquidity\b/i,
      /alternate route/i,
      /fallback.?offer/i,
      /liquidity.?fallback/i,
    ],
    chains: ["ethereum"],
  },
  "protocol:soroswap:env": {
    queryTypes: ["stellar_swap_quote"],
    keywords: [/\bstellar\b/i, /\bsoroswap\b/i, /\bsoroban\b/i, /\bXLM\b/i],
    chains: ["stellar"],
  },
  "protocol:soroswap:swap": {
    executeActions: ["stellar_swap"],
    queryTypes: ["stellar_swap_quote"],
    keywords: [/\bswap\b/i, /\bXLM\b/i, /\bUSDC\b/i, /stellar_swap/i],
    chains: ["stellar"],
  },
  "protocol:stellar:routing-fallback": {
    queryTypes: ["stellar_swap_quote"],
    keywords: [
      /swap on stellar/i,
      /stellar routing/i,
      /wrong network/i,
      /stellar_routing_fallback/i,
    ],
    chains: ["stellar", "ethereum"],
  },
};
