/** Default lib/radiant-client.ts shipped with generated Next.js apps. Template v10 — notifications + shared data + external API proxy. */
export const RADIANT_CLIENT_TEMPLATE_VERSION = 10;

export const RADIANT_CLIENT_TS = `/** Radiant platform client — project-scoped DeepBook & wallet APIs on Radiant. Template v10. */

export type SwapQuoteParams = {
  amount: number;
  side: "buy" | "sell";
  pool_key?: string;
  input_coin?: string;
  output_coin?: string;
};

export type SwapQuoteResult = {
  pool_key: string;
  input_amount_display: number;
  output_amount_display: number;
  input_coin: string;
  output_coin: string;
  min_out_display?: number;
  /** Alias for output_amount_display — use in UI labels. */
  estimated_out_display?: number;
};

export type PoolInfoResult = {
  pool_key: string;
  base_coin: string;
  quote_coin: string;
  ticker?: { last_price?: number };
};

export type AppActionExecuted = {
  status: "executed";
  action?: string;
  digest: string;
  explorer_url: string | null;
  agent_transaction_id?: string;
  result: Record<string, unknown>;
};

export type AppActionApprovalRequired = {
  status: "approval_required";
  action?: string;
  agent_transaction_id: string;
  pending: Record<string, unknown>;
};

export type AppActionErrorResult = {
  status: "error";
  action?: string;
  error: { code: string; message: string; details?: unknown };
};

export type AppActionResult =
  | AppActionExecuted
  | AppActionApprovalRequired
  | AppActionErrorResult;

export class RadiantActionError extends Error {
  code: string;
  details?: unknown;

  constructor(message: string, code: string, details?: unknown) {
    super(message);
    this.name = "RadiantActionError";
    this.code = code;
    this.details = details;
  }
}

export function isApprovalRequired(
  result: AppActionResult,
): result is AppActionApprovalRequired {
  return result.status === "approval_required";
}

declare global {
  interface Window {
    __RADIANT_PROJECT_ID__?: string;
    __RADIANT_INSTALLATION_ID__?: string;
    __RADIANT_SESSION_ID__?: string;
    __RADIANT_PREVIEW_FETCH__?: (path: string, init?: RequestInit) => Promise<Response>;
  }
}

function readPublicEnv(key: string): string {
  try {
    if (typeof process !== "undefined" && process.env && typeof process.env[key] === "string") {
      return process.env[key] as string;
    }
  } catch {
    // Browser preview has no Node process global.
  }
  return "";
}

function projectId(): string {
  if (typeof window !== "undefined" && window.__RADIANT_PROJECT_ID__) {
    return window.__RADIANT_PROJECT_ID__;
  }
  return readPublicEnv("NEXT_PUBLIC_RADIANT_PROJECT_ID");
}

function installationId(): string {
  if (typeof window !== "undefined" && window.__RADIANT_INSTALLATION_ID__) {
    return window.__RADIANT_INSTALLATION_ID__;
  }
  return readPublicEnv("NEXT_PUBLIC_RADIANT_INSTALLATION_ID");
}

function sessionId(): string {
  if (typeof window !== "undefined" && window.__RADIANT_SESSION_ID__) {
    return window.__RADIANT_SESSION_ID__;
  }
  return readPublicEnv("NEXT_PUBLIC_RADIANT_SESSION_ID");
}

function scopeIds(): {
  projectId: string;
  installationId: string | null;
  sessionId: string;
} {
  const install = installationId();
  const project = projectId();
  const session = sessionId();
  if (install) {
    if (!project) {
      throw new Error("Missing Radiant project id for installed app");
    }
    return { projectId: project, installationId: install, sessionId: session };
  }
  if (project) {
    return { projectId: project, installationId: null, sessionId: session };
  }
  if (session) {
    return { projectId: "", installationId: null, sessionId: session };
  }
  throw new Error("Missing Radiant project or session id");
}

function projectApiPrefix(): string {
  const { projectId: id, sessionId: sid } = scopeIds();
  if (sid && !id) {
    return "/api/v1/chat/sessions/" + sid;
  }
  return "/api/v1/projects/" + id;
}

function actionApiPath(action: string): string {
  const { projectId: id, installationId: install, sessionId: sid } = scopeIds();
  if (install) {
    return "/api/v1/installations/" + install + "/actions/" + action;
  }
  if (sid && !id) {
    return "/api/v1/chat/sessions/" + sid + "/actions/" + action;
  }
  return "/api/v1/projects/" + id + "/actions/" + action;
}

async function platformFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  if (typeof window !== "undefined" && window.__RADIANT_PREVIEW_FETCH__) {
    return window.__RADIANT_PREVIEW_FETCH__(path, { ...init, headers });
  }
  return fetch(path, { ...init, headers, credentials: "include" });
}

async function parseEnvelope<T>(res: Response): Promise<T> {
  const body = (await res.json()) as {
    success?: boolean;
    data?: T;
    error?: { message?: string; code?: string };
  };
  if (!res.ok || !body.success || body.data === undefined) {
    throw new RadiantActionError(
      body.error?.message ?? "Radiant API request failed",
      body.error?.code ?? "API_ERROR",
    );
  }
  return body.data;
}

async function parseActionResult(res: Response): Promise<AppActionResult> {
  const result = await parseEnvelope<AppActionResult>(res);
  if (result.status === "error") {
    throw new RadiantActionError(result.error.message, result.error.code, result.error.details);
  }
  return result;
}

/** Execute any registered app action via the agent wallet. Returns approval_required without throwing. */
export async function executeAction(
  action: string,
  params: Record<string, unknown> = {},
): Promise<AppActionResult> {
  const res = await platformFetch(actionApiPath(action), {
    method: "POST",
    body: JSON.stringify(params),
  });
  return parseActionResult(res);
}

export async function executeSwap(
  params: SwapQuoteParams & { slippage_bps?: number; pay_with_deep?: boolean },
): Promise<AppActionResult> {
  return executeAction("swap", params);
}

export async function executeFlashLoan(
  params: Record<string, unknown>,
): Promise<AppActionResult> {
  return executeAction("flash_loan", params);
}

export async function executeStake(params: Record<string, unknown>): Promise<AppActionResult> {
  return executeAction("stake", params);
}

export async function executeUnstake(params: Record<string, unknown>): Promise<AppActionResult> {
  return executeAction("unstake", params);
}

/** Map from/to coins to DeepBook side for a pool (base_quote pool_key). */
export function resolveSwapSide(pool_key: string, from_coin: string): "buy" | "sell" {
  const parts = pool_key.split("_");
  const base = parts[0] ?? "";
  const quote = parts[1] ?? "";
  if (from_coin === base) return "sell";
  if (from_coin === quote) return "buy";
  return "sell";
}

function normalizePoolKey(pool_keyOrParams: string | { pool_key?: string }): string {
  if (typeof pool_keyOrParams === "string") {
    return pool_keyOrParams || "SUI_USDC";
  }
  return pool_keyOrParams.pool_key ?? "SUI_USDC";
}

export async function swapQuote(params: SwapQuoteParams): Promise<SwapQuoteResult> {
  const res = await platformFetch(projectApiPrefix() + "/swap/quote", {
    method: "POST",
    body: JSON.stringify(params),
  });
  const data = await parseEnvelope<
    SwapQuoteResult & { min_out_display?: number; estimated_out_display?: number }
  >(res);
  return {
    ...data,
    estimated_out_display: data.estimated_out_display ?? data.output_amount_display,
    min_out_display: data.min_out_display ?? data.output_amount_display,
  };
}

export async function poolInfo(
  pool_keyOrParams: string | { pool_key?: string } = "SUI_USDC",
): Promise<PoolInfoResult> {
  const pool_key = normalizePoolKey(pool_keyOrParams);
  const res = await platformFetch(
    projectApiPrefix() +
      "/deepbook/pool-info?pool_key=" +
      encodeURIComponent(pool_key),
  );
  return parseEnvelope<PoolInfoResult>(res);
}

export async function flashLoanQuote(
  params: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const res = await platformFetch(projectApiPrefix() + "/deepbook/flash-loan/quote", {
    method: "POST",
    body: JSON.stringify(params),
  });
  return parseEnvelope<Record<string, unknown>>(res);
}

export async function openOrders(pool_key = "SUI_USDC"): Promise<Record<string, unknown>> {
  const res = await platformFetch(
    projectApiPrefix() +
      "/deepbook/open-orders?pool_key=" +
      encodeURIComponent(pool_key),
  );
  return parseEnvelope<Record<string, unknown>>(res);
}

export async function stakeBalance(pool_key = "SUI_USDC"): Promise<Record<string, unknown>> {
  const res = await platformFetch(
    projectApiPrefix() +
      "/deepbook/stake-balance?pool_key=" +
      encodeURIComponent(pool_key),
  );
  return parseEnvelope<Record<string, unknown>>(res);
}

export async function governanceState(pool_key = "SUI_USDC"): Promise<Record<string, unknown>> {
  const res = await platformFetch(
    projectApiPrefix() +
      "/deepbook/governance-state?pool_key=" +
      encodeURIComponent(pool_key),
  );
  return parseEnvelope<Record<string, unknown>>(res);
}

function deepbookIndexerQuery(params?: Record<string, unknown>): string {
  if (!params) {
    return "";
  }
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value != null && typeof value !== "object") {
      search.set(key, String(value));
    }
  }
  const qs = search.toString();
  return qs.length > 0 ? "?" + qs : "";
}

async function deepbookIndexerRead(
  path: string,
  params?: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const res = await platformFetch(projectApiPrefix() + "/deepbook/" + path + deepbookIndexerQuery(params));
  return parseEnvelope<Record<string, unknown>>(res);
}

/** OHLCV candlesticks from the DeepBook indexer — use for price trend charts. */
export async function deepbookOhlcv(params?: {
  pool_key?: string;
  interval?: string;
  limit?: number;
}): Promise<Record<string, unknown>> {
  return deepbookIndexerRead("ohlcv", params);
}

/** Recent trades from the DeepBook indexer. */
export async function deepbookTrades(params?: {
  pool_key?: string;
  limit?: number;
  start_time?: number;
  end_time?: number;
}): Promise<Record<string, unknown>> {
  return deepbookIndexerRead("trades", params);
}

/** Pool or manager volume from the DeepBook indexer. */
export async function deepbookVolume(params?: {
  pool_key?: string;
  scope?: "pool" | "manager" | "all_pools";
  start_time?: number;
  end_time?: number;
  interval?: string;
}): Promise<Record<string, unknown>> {
  return deepbookIndexerRead("volume", params);
}

// --- DeepBook Margin helpers ---

export async function marginManagerInfo(margin_manager_key?: string): Promise<Record<string, unknown>> {
  const qs = margin_manager_key ? "?margin_manager_key=" + encodeURIComponent(margin_manager_key) : "";
  const res = await platformFetch(projectApiPrefix() + "/deepbook/margin-manager-info" + qs);
  return parseEnvelope<Record<string, unknown>>(res);
}

export async function marginPoolInfo(pool_key = "SUI_DBUSDC"): Promise<Record<string, unknown>> {
  const res = await platformFetch(
    projectApiPrefix() + "/deepbook/margin-pool-info?pool_key=" + encodeURIComponent(pool_key),
  );
  return parseEnvelope<Record<string, unknown>>(res);
}

export async function marginRiskRatio(margin_manager_key?: string): Promise<Record<string, unknown>> {
  const qs = margin_manager_key ? "?margin_manager_key=" + encodeURIComponent(margin_manager_key) : "";
  const res = await platformFetch(projectApiPrefix() + "/deepbook/margin-risk-ratio" + qs);
  return parseEnvelope<Record<string, unknown>>(res);
}

export async function marginOpenOrders(params?: {
  pool_key?: string;
  margin_manager_key?: string;
}): Promise<Record<string, unknown>> {
  const search = new URLSearchParams();
  if (params?.pool_key) {
    search.set("pool_key", params.pool_key);
  }
  if (params?.margin_manager_key) {
    search.set("margin_manager_key", params.margin_manager_key);
  }
  const qs = search.toString();
  const res = await platformFetch(
    projectApiPrefix() + "/deepbook/margin-open-orders" + (qs ? "?" + qs : ""),
  );
  return parseEnvelope<Record<string, unknown>>(res);
}

function marginReadQuery(params?: Record<string, unknown>): string {
  if (!params) {
    return "";
  }
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value != null && typeof value !== "object") {
      search.set(key, String(value));
    }
  }
  const qs = search.toString();
  return qs.length > 0 ? "?" + qs : "";
}

async function marginDeepbookRead(
  path: string,
  params?: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const res = await platformFetch(projectApiPrefix() + "/deepbook/" + path + marginReadQuery(params));
  return parseEnvelope<Record<string, unknown>>(res);
}

export async function marginTpslInfo(params?: {
  margin_manager_key?: string;
  pool_key?: string;
  conditional_order_id?: string;
}): Promise<Record<string, unknown>> {
  return marginDeepbookRead("margin-tpsl-info", params);
}

export async function marginLiquidations(params?: Record<string, unknown>): Promise<Record<string, unknown>> {
  return marginDeepbookRead("margin-liquidations", params);
}

export async function marginCollateralHistory(params?: Record<string, unknown>): Promise<Record<string, unknown>> {
  return marginDeepbookRead("margin-collateral-history", params);
}

export async function marginLoanHistory(params?: Record<string, unknown>): Promise<Record<string, unknown>> {
  return marginDeepbookRead("margin-loan-history", params);
}

export async function marginAtRiskStates(params?: Record<string, unknown>): Promise<Record<string, unknown>> {
  return marginDeepbookRead("margin-at-risk-states", params);
}

export async function marginManagersInfo(): Promise<Record<string, unknown>> {
  return marginDeepbookRead("margin-managers-info");
}

export async function marginManagerCreated(params?: Record<string, unknown>): Promise<Record<string, unknown>> {
  return marginDeepbookRead("margin-manager-created", params);
}

export async function marginSupplyHistory(params?: Record<string, unknown>): Promise<Record<string, unknown>> {
  return marginDeepbookRead("margin-supply-history", params);
}

export async function marginIndexerSupply(): Promise<Record<string, unknown>> {
  return marginDeepbookRead("margin-indexer-supply");
}

export async function marginManagerState(params?: {
  margin_manager_key?: string;
  pool_key?: string;
}): Promise<Record<string, unknown>> {
  return marginDeepbookRead("margin-manager-state", params);
}

// --- DeepBook Predict helpers ---

export async function predictMarkets(): Promise<Record<string, unknown>> {
  const res = await platformFetch(projectApiPrefix() + "/deepbook/predict-markets");
  return parseEnvelope<Record<string, unknown>>(res);
}

export async function predictTradeAmounts(params: {
  oracle_id: string;
  expiry: number;
  strike: number;
  is_up: boolean;
  quantity: number;
}): Promise<Record<string, unknown>> {
  const qs = new URLSearchParams({
    oracle_id: params.oracle_id,
    expiry: String(params.expiry),
    strike: String(params.strike),
    is_up: String(params.is_up),
    quantity: String(params.quantity),
  }).toString();
  const res = await platformFetch(projectApiPrefix() + "/deepbook/predict-trade-amounts?" + qs);
  return parseEnvelope<Record<string, unknown>>(res);
}

export async function predictRangeAmounts(params: {
  oracle_id: string;
  expiry: number;
  lower_strike: number;
  higher_strike: number;
  quantity: number;
}): Promise<Record<string, unknown>> {
  const qs = new URLSearchParams({
    oracle_id: params.oracle_id,
    expiry: String(params.expiry),
    lower_strike: String(params.lower_strike),
    higher_strike: String(params.higher_strike),
    quantity: String(params.quantity),
  }).toString();
  const res = await platformFetch(projectApiPrefix() + "/deepbook/predict-range-amounts?" + qs);
  return parseEnvelope<Record<string, unknown>>(res);
}

export async function predictManagerInfo(): Promise<Record<string, unknown>> {
  const res = await platformFetch(projectApiPrefix() + "/deepbook/predict-manager-info");
  return parseEnvelope<Record<string, unknown>>(res);
}

export async function predictVaultSummary(): Promise<Record<string, unknown>> {
  const res = await platformFetch(projectApiPrefix() + "/deepbook/predict-vault-summary");
  return parseEnvelope<Record<string, unknown>>(res);
}

export type AgentTransactionApprovalResult =
  | {
      status: "executed";
      agent_transaction_id: string;
      digest: string;
      explorer_url: string | null;
      result: Record<string, unknown>;
    }
  | {
      status: "error";
      agent_transaction_id: string;
      error: { code: string; message: string; details?: unknown };
    };

/** Approve a pending agent transaction (in-app confirmation modal). */
export async function approveAgentTransaction(
  transactionId: string,
): Promise<AgentTransactionApprovalResult> {
  const res = await platformFetch(
    "/api/v1/agent/transactions/" + encodeURIComponent(transactionId) + "/approve",
    { method: "POST" },
  );
  return parseEnvelope<AgentTransactionApprovalResult>(res);
}

/** Reject / cancel a pending agent transaction. */
export async function rejectAgentTransaction(
  transactionId: string,
): Promise<{ status: "rejected"; agent_transaction_id: string }> {
  const res = await platformFetch(
    "/api/v1/agent/transactions/" + encodeURIComponent(transactionId) + "/reject",
    { method: "POST" },
  );
  return parseEnvelope<{ status: "rejected"; agent_transaction_id: string }>(res);
}

// --- External API proxy ---

export type ExternalFetchOptions = {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
};

export type ExternalFetchResult = {
  status: number;
  headers: Record<string, string>;
  body: string;
};

/**
 * Fetch an external URL through the Radiant proxy. Handles CORS and keeps
 * credentials server-side. Works in both preview iframe and deployed apps.
 *
 * Usage:
 *   const data = await fetchExternal("https://api.coingecko.com/api/v3/simple/price?ids=sui&vs_currencies=usd");
 *   const parsed = JSON.parse(data.body);
 */
export async function fetchExternal(
  url: string,
  options: ExternalFetchOptions = {},
): Promise<ExternalFetchResult> {
  const res = await platformFetch("/api/v1/proxy", {
    method: "POST",
    body: JSON.stringify({
      url,
      method: options.method ?? "GET",
      headers: options.headers,
      body: options.body,
    }),
  });
  return parseEnvelope<ExternalFetchResult>(res);
}

/**
 * Convenience wrapper: fetch external JSON and parse it in one step.
 *
 * Usage:
 *   const price = await fetchExternalJson<{ sui: { usd: number } }>(
 *     "https://api.coingecko.com/api/v3/simple/price?ids=sui&vs_currencies=usd"
 *   );
 */
export async function fetchExternalJson<T = unknown>(
  url: string,
  options: ExternalFetchOptions = {},
): Promise<T> {
  const result = await fetchExternal(url, options);
  return JSON.parse(result.body) as T;
}

// --- App Data (per-user persistent storage) ---

export type AppDataRecord = {
  id: string;
  collection: string;
  key: string | null;
  data: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type AppDataListResult = {
  records: AppDataRecord[];
  total: number;
  limit: number;
  offset: number;
};

/**
 * Store data in the app's persistent storage. Data is per-user and follows
 * the user across devices (web, mobile, etc.).
 *
 * Use a key for singleton records (settings, preferences):
 *   await storeAppData("settings", { theme: "dark" }, { key: "user_prefs" });
 *
 * Omit key for append-only collections (history, logs):
 *   await storeAppData("swap_history", { pool: "SUI_USDC", amount: 10 });
 */
export async function storeAppData(
  collection: string,
  data: Record<string, unknown>,
  options: { key?: string } = {},
): Promise<AppDataRecord> {
  const res = await platformFetch(projectApiPrefix() + "/data", {
    method: "POST",
    body: JSON.stringify({ collection, data, key: options.key ?? null }),
  });
  return parseEnvelope<AppDataRecord>(res);
}

/**
 * Query data from a collection. Returns records newest-first by default.
 *
 *   const history = await queryAppData("swap_history", { limit: 20 });
 *   const prefs = await queryAppData("settings", { key: "user_prefs" });
 */
export async function queryAppData(
  collection: string,
  options: { key?: string; limit?: number; offset?: number; order?: "asc" | "desc" } = {},
): Promise<AppDataListResult> {
  const qs = new URLSearchParams();
  if (options.key) qs.set("key", options.key);
  if (options.limit) qs.set("limit", String(options.limit));
  if (options.offset) qs.set("offset", String(options.offset));
  if (options.order) qs.set("order", options.order);
  const query = qs.toString();
  const path = projectApiPrefix() + "/data/" + encodeURIComponent(collection) + (query ? "?" + query : "");
  const res = await platformFetch(path);
  return parseEnvelope<AppDataListResult>(res);
}

/**
 * Delete data from a collection.
 *
 *   await deleteAppData("swap_history");                   // delete all in collection
 *   await deleteAppData("settings", { key: "user_prefs" }); // delete by key
 *   await deleteAppData("swap_history", { id: "uuid" });    // delete by ID
 */
export async function deleteAppData(
  collection: string,
  options: { key?: string; id?: string } = {},
): Promise<{ deleted: number }> {
  const res = await platformFetch(projectApiPrefix() + "/data", {
    method: "DELETE",
    body: JSON.stringify({ collection, key: options.key ?? null, id: options.id }),
  });
  return parseEnvelope<{ deleted: number }>(res);
}

// --- Shared Data (cross-user, visible to all installers of the same app) ---

export type SharedAppDataRecord = AppDataRecord & {
  author_id: string;
};

export type SharedAppDataListResult = {
  records: SharedAppDataRecord[];
  total: number;
  limit: number;
  offset: number;
};

/**
 * Store data into a shared collection. All users of the same app can read it.
 * The write is attributed to your Radiant account (author_id in the record).
 *
 * Use for multi-user features: chat messages, shared boards, leaderboards.
 *
 *   await storeSharedData("messages", { text: "Hello!", sender: userName });
 */
export async function storeSharedData(
  collection: string,
  data: Record<string, unknown>,
  options: { key?: string } = {},
): Promise<SharedAppDataRecord> {
  const res = await platformFetch(projectApiPrefix() + "/shared/" + encodeURIComponent(collection), {
    method: "POST",
    body: JSON.stringify({ collection, data, key: options.key ?? null }),
  });
  return parseEnvelope<SharedAppDataRecord>(res);
}

/**
 * Query a shared collection — returns records from ALL users of this app.
 * Default order is ascending (oldest first), useful for chat timelines.
 *
 *   const msgs = await querySharedData("messages", { limit: 50 });
 *   const newMsgs = await querySharedData("messages", { since: lastTimestamp });
 */
export async function querySharedData(
  collection: string,
  options: { since?: string; limit?: number; offset?: number; order?: "asc" | "desc" } = {},
): Promise<SharedAppDataListResult> {
  const qs = new URLSearchParams();
  if (options.since) qs.set("since", options.since);
  if (options.limit) qs.set("limit", String(options.limit));
  if (options.offset) qs.set("offset", String(options.offset));
  if (options.order) qs.set("order", options.order);
  const query = qs.toString();
  const path = projectApiPrefix() + "/shared/" + encodeURIComponent(collection) + (query ? "?" + query : "");
  const res = await platformFetch(path);
  return parseEnvelope<SharedAppDataListResult>(res);
}

// --- Notifications (in-app inbox, web push, poll evaluators) ---

export type NotificationChannel = "in_app" | "web_push" | "email";

export type NotificationSchedule =
  | { kind: "once"; at: string }
  | { kind: "cron"; expression: string; timezone: string }
  | { kind: "interval"; every_seconds: number; until?: string };

export type NotificationTypeDefinition = {
  type: string;
  label: string;
  description?: string;
  trigger_kind: "poll" | "schedule" | "event" | "manual";
  condition_schema?: Array<{
    name: string;
    type: "string" | "number" | "boolean" | "array" | "object";
    required?: boolean;
    description?: string;
  }>;
  default_channels?: NotificationChannel[];
};

export type ProjectNotificationSchema = {
  schema_version: number;
  app_id: string;
  types: NotificationTypeDefinition[];
};

export type NotificationRuleRecord = {
  id: string;
  notification_type: string;
  label: string | null;
  status: string;
  condition: Record<string, unknown>;
  schedule: NotificationSchedule | null;
  channels: NotificationChannel[];
  cooldown_seconds: number;
  trigger_once: boolean;
  last_triggered_at: string | null;
  expires_at: string | null;
  created_at: string;
  updated_at: string;
};

export type NotificationEventRecord = {
  id: string;
  notification_type: string;
  title: string;
  body: string;
  payload: Record<string, unknown>;
  read_at: string | null;
  created_at: string;
};

function notificationRulesPrefix(): string {
  const { projectId: id, installationId: install } = scopeIds();
  if (install) {
    return "/api/v1/installations/" + install + "/notifications";
  }
  if (id) {
    return "/api/v1/projects/" + id + "/notifications";
  }
  return "/api/v1/notifications";
}

/**
 * Load alert types declared for this app (poll evaluators, condition fields, labels).
 * Requires project scope — chat drafts with session-only scope should save to a project first.
 */
export async function getNotificationSchema(): Promise<{ schema: ProjectNotificationSchema | null }> {
  const { projectId: id } = scopeIds();
  if (!id) {
    throw new RadiantActionError(
      "Notification schema requires a saved project scope",
      "MISSING_PROJECT_SCOPE",
    );
  }
  const res = await platformFetch("/api/v1/projects/" + id + "/notifications/schema");
  return parseEnvelope<{ schema: ProjectNotificationSchema | null }>(res);
}

export type CreateNotificationRuleInput = {
  notification_type: string;
  condition?: Record<string, unknown>;
  schedule?: NotificationSchedule;
  channels?: NotificationChannel[];
  label?: string;
  cooldown_seconds?: number;
  trigger_once?: boolean;
  expires_at?: string;
};

/** Create an alert rule scoped to this app (or platform when unscoped). */
export async function createNotificationRule(
  input: CreateNotificationRuleInput,
): Promise<NotificationRuleRecord> {
  const prefix = notificationRulesPrefix();
  const path =
    prefix === "/api/v1/notifications" ? "/api/v1/notifications/rules" : prefix + "/rules";
  const res = await platformFetch(path, {
    method: "POST",
    body: JSON.stringify(input),
  });
  return parseEnvelope<NotificationRuleRecord>(res);
}

export type ListNotificationRulesOptions = {
  status?: "active" | "paused" | "expired" | "deleted";
  notification_type?: string;
  limit?: number;
  offset?: number;
};

export async function listNotificationRules(
  options: ListNotificationRulesOptions = {},
): Promise<{ rules: NotificationRuleRecord[]; total: number; limit: number; offset: number }> {
  const prefix = notificationRulesPrefix();
  const path =
    prefix === "/api/v1/notifications" ? "/api/v1/notifications/rules" : prefix + "/rules";
  const qs = new URLSearchParams();
  if (options.status) qs.set("status", options.status);
  if (options.notification_type) qs.set("notification_type", options.notification_type);
  if (options.limit) qs.set("limit", String(options.limit));
  if (options.offset) qs.set("offset", String(options.offset));
  const query = qs.toString();
  const res = await platformFetch(path + (query ? "?" + query : ""));
  return parseEnvelope<{ rules: NotificationRuleRecord[]; total: number; limit: number; offset: number }>(
    res,
  );
}

export async function deleteNotificationRule(ruleId: string): Promise<{ deleted: boolean }> {
  const res = await platformFetch("/api/v1/notifications/rules/" + encodeURIComponent(ruleId), {
    method: "DELETE",
  });
  return parseEnvelope<{ deleted: boolean }>(res);
}

export type ListNotificationsOptions = {
  unread?: boolean;
  limit?: number;
  offset?: number;
};

/** List inbox notifications for the signed-in user (platform-wide, not app-scoped). */
export async function listNotifications(
  options: ListNotificationsOptions = {},
): Promise<{ events: NotificationEventRecord[]; total: number; limit: number; offset: number }> {
  const qs = new URLSearchParams();
  if (options.unread !== undefined) qs.set("unread", options.unread ? "true" : "false");
  if (options.limit) qs.set("limit", String(options.limit));
  if (options.offset) qs.set("offset", String(options.offset));
  const query = qs.toString();
  const res = await platformFetch(
    "/api/v1/notifications/events" + (query ? "?" + query : ""),
  );
  return parseEnvelope<{
    events: NotificationEventRecord[];
    total: number;
    limit: number;
    offset: number;
  }>(res);
}

export async function markNotificationRead(eventId: string): Promise<NotificationEventRecord> {
  const res = await platformFetch(
    "/api/v1/notifications/events/" + encodeURIComponent(eventId) + "/read",
    { method: "POST" },
  );
  return parseEnvelope<NotificationEventRecord>(res);
}
`;

export const NEXT_APP_LAYOUT_TSX = `import "./globals.css";
import "../lib/radiant-agent-runtime";
import type { ReactNode } from "react";
import { AgentIndicator } from "../components/AgentIndicator";

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        {children}
        <AgentIndicator />
      </body>
    </html>
  );
}
`;

export const NEXT_APP_GLOBALS_CSS = `@import "tailwindcss";

:root {
  --hero-bg: #f5f0e8;
  --hero-ink: #1a1a1a;
  --hero-amber: #ffb01f;
  --hero-violet: #8e5bff;
  --hero-mint: #00c478;
}

body {
  margin: 0;
  min-height: 100vh;
  background: var(--hero-bg);
  color: var(--hero-ink);
  font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
}
`;
