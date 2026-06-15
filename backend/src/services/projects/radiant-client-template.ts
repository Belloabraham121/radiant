/** Default lib/radiant-client.ts shipped with generated Next.js apps. Template v6 — browser-safe env + swap helpers. */
export const RADIANT_CLIENT_TEMPLATE_VERSION = 6;

export const RADIANT_CLIENT_TS = `/** Radiant platform client — project-scoped DeepBook & wallet APIs on Radiant. Template v6. */

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
