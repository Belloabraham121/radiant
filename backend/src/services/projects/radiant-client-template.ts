/** Default lib/radiant-client.ts shipped with generated Next.js apps. Template v4 — query helpers for DeepBook tabs. */
export const RADIANT_CLIENT_TEMPLATE_VERSION = 4;

export const RADIANT_CLIENT_TS = `/** Radiant platform client — project-scoped DeepBook & wallet APIs on Radiant. Template v4. */

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
    __RADIANT_PREVIEW_FETCH__?: (path: string, init?: RequestInit) => Promise<Response>;
  }
}

function projectId(): string {
  if (typeof window !== "undefined" && window.__RADIANT_PROJECT_ID__) {
    return window.__RADIANT_PROJECT_ID__;
  }
  return process.env.NEXT_PUBLIC_RADIANT_PROJECT_ID ?? "";
}

function installationId(): string {
  if (typeof window !== "undefined" && window.__RADIANT_INSTALLATION_ID__) {
    return window.__RADIANT_INSTALLATION_ID__;
  }
  return process.env.NEXT_PUBLIC_RADIANT_INSTALLATION_ID ?? "";
}

function scopeIds(): { projectId: string; installationId: string | null } {
  const install = installationId();
  const project = projectId();
  if (install) {
    if (!project) {
      throw new Error("Missing Radiant project id for installed app");
    }
    return { projectId: project, installationId: install };
  }
  if (!project) {
    throw new Error("Missing Radiant project id");
  }
  return { projectId: project, installationId: null };
}

function projectApiPrefix(): string {
  const { projectId: id } = scopeIds();
  return "/api/v1/projects/" + id;
}

function actionApiPath(action: string): string {
  const { projectId: id, installationId: install } = scopeIds();
  if (install) {
    return "/api/v1/installations/" + install + "/actions/" + action;
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

export async function swapQuote(params: SwapQuoteParams): Promise<SwapQuoteResult> {
  const res = await platformFetch(projectApiPrefix() + "/swap/quote", {
    method: "POST",
    body: JSON.stringify(params),
  });
  return parseEnvelope<SwapQuoteResult>(res);
}

export async function poolInfo(pool_key = "SUI_USDC"): Promise<PoolInfoResult> {
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
