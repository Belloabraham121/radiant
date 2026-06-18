/** Canonical lib/radiant-client surface — shared by agent prompts and generate_app tool summaries. */

export type RadiantClientApiCategory = {
  id: string;
  label: string;
  /** Preferred camelCase exports in generated apps */
  exports: readonly string[];
  guidance: string;
};

export const RADIANT_CLIENT_API_CATEGORIES: readonly RadiantClientApiCategory[] = [
  {
    id: "market_data",
    label: "Market data & charts",
    exports: [
      "deepbookPools",
      "poolInfo",
      "deepbookOhlcv",
      "deepbookTrades",
      "deepbookVolume",
      "swapQuote",
    ],
    guidance:
      "Charts: OhlcvAreaChart from lib/radiant-charts with deepbookOhlcv({ pool_key, interval, limit }).candles. " +
      "Load each API in its own try/catch — never Promise.all unknown helpers.",
  },
  {
    id: "defi_execute",
    label: "On-chain actions (via executeAction / __radiantAgent)",
    exports: [
      "executeAction",
      "executeSwap",
      "executeFlashLoan",
      "executeStake",
      "executeUnstake",
      "approveAgentTransaction",
    ],
    guidance:
      "Declare actions in lib/radiant-actions.ts and register window.__radiantAgent handlers. " +
      "Use executeAction('flash_loan'|'swap'|…) — platform shows approval modals automatically.",
  },
  {
    id: "flash_margin",
    label: "Flash loans, staking, governance, margin",
    exports: [
      "flashLoanQuote",
      "stakeBalance",
      "stakeRequired",
      "governanceState",
      "openOrders",
      "marginPoolInfo",
      "marginManagerInfo",
      "marginRiskRatio",
      "marginOpenOrders",
      "marginManagerState",
      "marginLiquidations",
      "marginCollateralHistory",
      "marginLoanHistory",
    ],
    guidance:
      "Default pool_key: testnet SUI_DBUSDC, mainnet SUI_USDC. " +
      "flashLoanQuote({ pool_key, borrow_amount, asset: 'base'|'quote', strategy }).",
  },
  {
    id: "predict",
    label: "DeepBook Predict",
    exports: [
      "predictMarkets",
      "predictTradeAmounts",
      "predictRangeAmounts",
      "predictManagerInfo",
      "predictVaultSummary",
    ],
    guidance: "Preview mint costs with predictTradeAmounts before executeAction('predict_mint', …).",
  },
  {
    id: "wallet",
    label: "Wallet & portfolio",
    exports: ["tokenBalances", "balanceManagerInfo"],
    guidance: "Agent wallet holdings and DeepBook balance manager — for finance dashboards and research UIs.",
  },
  {
    id: "storage",
    label: "App persistence",
    exports: ["storeAppData", "queryAppData", "deleteAppData", "storeSharedData", "querySharedData"],
    guidance: "Per-user lists/settings use storeAppData; multi-user chat/boards use storeSharedData.",
  },
  {
    id: "notifications",
    label: "Alerts & inbox",
    exports: [
      "getNotificationSchema",
      "createNotificationRule",
      "listNotificationRules",
      "deleteNotificationRule",
      "listNotifications",
      "markNotificationRead",
    ],
    guidance: "Declare types in lib/radiant-notifications.ts; wire NotificationAlertsPanel for settings UIs.",
  },
  {
    id: "external",
    label: "External / research APIs (user-provided URL + API key)",
    exports: ["fetchExternal", "fetchExternalJson"],
    guidance:
      "Workflow when the user gives an API URL and key: (1) verify in chat with call_api and the same headers, " +
      "(2) wire fetchExternalJson(url, { headers: { Authorization: 'Bearer KEY' } }) or X-Api-Key in the app — " +
      "the Radiant proxy forwards auth headers (never raw fetch() to external URLs). " +
      "(3) If they want alerts on that data, add lib/radiant-notifications.ts + NotificationAlertsPanel and createNotificationRule().",
  },
  {
    id: "notifications_external",
    label: "Notifications on custom / external data apps",
    exports: [
      "getNotificationSchema",
      "createNotificationRule",
      "listNotificationRules",
      "deleteNotificationRule",
    ],
    guidance:
      "Declare types in lib/radiant-notifications.ts (trigger_kind: schedule | event | poll). " +
      "schedule: time/cron reminders; event: webhook ingress when external systems push; poll: platform evaluators " +
      "(deepbook.flash_loan_scanner, price.oracle_watch). Import components/NotificationAlertsPanel for a settings UI. " +
      "Combine with fetchExternalJson for live API dashboards + alert rules in the same app.",
  },
] as const;

/** snake_case aliases exported alongside camelCase (query_chain parity). */
export const RADIANT_CLIENT_SNAKE_CASE_ALIASES = [
  "swap_quote",
  "flash_loan_quote",
  "deepbook_pools",
  "deepbook_pool_info",
  "deepbook_ohlcv",
  "deepbook_trades",
  "deepbook_volume",
  "deepbook_open_orders",
  "deepbook_stake_balance",
  "deepbook_stake_required",
  "deepbook_governance_state",
  "token_balances",
  "balance_manager_info",
  "margin_pool_info",
  "margin_manager_info",
  "margin_risk_ratio",
  "margin_open_orders",
  "predict_markets",
] as const;

export function formatRadiantClientApiGuideForPrompt(): string {
  const lines = [
    "CRITICAL — lib/radiant-client integrations (generated apps ONLY — never invent API names):",
    "Import from \"../lib/radiant-client\". All listed functions exist — snake_case aliases (e.g. flash_loan_quote, deepbook_pools) are also exported for query_chain parity.",
  ];
  for (const category of RADIANT_CLIENT_API_CATEGORIES) {
    lines.push(
      `${category.label}: ${category.exports.join(", ")}. ${category.guidance}`,
    );
  }
  lines.push(
    "External research in apps: fetchExternalJson(url, { headers: { Authorization: 'Bearer …' } }). " +
      "Auth and X-Api-Key headers are forwarded by the Radiant proxy. " +
      "Never use query_chain, execute_transaction, or raw fetch() to external URLs inside generated app code.",
  );
  lines.push(formatExternalApiAndNotificationsWorkflowForPrompt());
  return lines.join("\n");
}

/** Step-by-step when the user supplies a third-party API URL, key, and optional alerts. */
export function formatExternalApiAndNotificationsWorkflowForPrompt(): string {
  return (
    "CRITICAL — User-provided external API + optional notifications:\n" +
    "1. VERIFY: call_api { url, method, headers: { Authorization: 'Bearer <key>' } } (or X-Api-Key) — confirm JSON before building.\n" +
    "2. BUILD: fetchExternalJson(url, { headers: { Authorization: 'Bearer <key>' } }) in useEffect — separate try/catch, show loading/error states.\n" +
    "3. NEVER embed keys in URLs as query params when the API supports headers; never use browser fetch() to external domains.\n" +
    "4. ALERTS: If the user wants notifications on this app, add lib/radiant-notifications.ts with alert types, import NotificationAlertsPanel, " +
    "wire createNotificationRule() from the UI or call create_notification_rule in chat. Use trigger_kind schedule for reminders, " +
    "event for webhook-driven alerts, poll when a platform evaluator applies (e.g. deepbook.flash_loan_scanner).\n" +
    "5. Same turn: when they ask for API integration AND alerts, do both — live data panel + notification manifest/panel."
  );
}

export function formatRadiantClientApiReminderForToolResult(): string {
  const exportList = RADIANT_CLIENT_API_CATEGORIES.flatMap((c) => c.exports).join(", ");
  return (
    "Platform APIs available in lib/radiant-client (auto-injected): " +
    exportList +
    ". snake_case query_chain aliases also exported. " +
    "Charts: OhlcvAreaChart + deepbookOhlcv(). External data: fetchExternalJson(url, { headers }) — auth headers forwarded. " +
    "Notifications: lib/radiant-notifications.ts + createNotificationRule. " +
    "Never invent helper names — if unsure, use only exports from this list."
  );
}
