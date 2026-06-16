import type { PlannedAction } from "../workflow/planner.types.js";

export type IntentProviderId = "deepbook" | "wallet" | "artifact" | "agent";

export type IntentProvider = {
  id: IntentProviderId;
  actions: readonly string[];
  queryTypes?: readonly string[];
};

const PROVIDERS: IntentProvider[] = [
  {
    id: "deepbook",
    actions: [
      "deepbook_deposit",
      "deepbook_withdraw",
      "deepbook_provision_manager",
      "deepbook_place_limit_order",
      "deepbook_place_market_order",
      "deepbook_cancel_order",
      "deepbook_cancel_all_orders",
      "swap",
    ],
    queryTypes: [
      "deepbook_pool_info",
      "deepbook_manager_balance",
      "deepbook_manager_info",
      "deepbook_open_orders",
      "swap_quote",
      "flash_loan_quote",
      "deepbook_trades",
      "deepbook_volume",
      "deepbook_ohlcv",
      "margin_pool_info",
      "margin_manager_info",
      "margin_open_orders",
      "margin_liquidations",
      "margin_collateral_history",
      "margin_loan_history",
      "margin_at_risk_states",
      "margin_managers_info",
    ],
  },
  {
    id: "wallet",
    actions: ["transfer_sui"],
    queryTypes: ["balance", "native_balance", "token_balances"],
  },
  {
    id: "artifact",
    actions: ["build"],
  },
  {
    id: "agent",
    actions: ["query"],
    queryTypes: ["agent_transactions"],
  },
];

export function resolveProviderForAction(action: PlannedAction): IntentProviderId {
  for (const provider of PROVIDERS) {
    if (provider.actions.includes(action)) {
      return provider.id;
    }
  }
  return "agent";
}

export function resolveProviderForQuery(query: string): IntentProviderId {
  for (const provider of PROVIDERS) {
    if (provider.queryTypes?.includes(query)) {
      return provider.id;
    }
  }
  return "agent";
}

export function listIntentProviders(): readonly IntentProvider[] {
  return PROVIDERS;
}
