import { randomUUID } from "node:crypto";
import { isCanvasRuntimeMock } from "../../../../config/canvas.js";
import { AppError } from "../../../../errors/app-error.js";
import { consumePolymarketRestToken } from "./polymarket-rate-limit.js";
import { getPolymarketConfig } from "./polymarket.config.js";
import {
  buildPolymarketL2Headers,
  derivePolymarketL2Credentials,
  getPolymarketBuilderCode,
} from "./polymarket-auth.service.js";
import { getWarmPrivyViemAccount } from "../../signing/warm-privy-lane.js";
import { assertKillSwitchClear } from "../../policy/canvas-kill-switch.js";

export type PolymarketOrderIntent = {
  workflow_id: string;
  token_id: string;
  side: "buy" | "sell";
  price?: number;
  size: number;
  order_type: "limit" | "market";
  est_usd?: number;
};

export type PolymarketOrderResult = {
  order_id: string;
  status: "submitted" | "mock";
  tx_hash?: string;
  explorer_url?: string;
  fill_price?: number;
  mock?: boolean;
};

let fetchImpl: typeof globalThis.fetch = (...args) => fetch(...args);

async function authenticatedPost(
  creds: Awaited<ReturnType<typeof derivePolymarketL2Credentials>>,
  path: string,
  body: Record<string, unknown>,
): Promise<Response> {
  const allowed = await consumePolymarketRestToken();
  if (!allowed) {
    throw new AppError(429, "RATE_LIMITED", "Polymarket REST rate limit exceeded.");
  }

  const config = getPolymarketConfig();
  const serialized = JSON.stringify(body);
  const headers = {
    Accept: "application/json",
    "Content-Type": "application/json",
    ...buildPolymarketL2Headers(creds, "POST", path, serialized),
  };

  return fetchImpl(`${config.clobBaseUrl}${path}`, {
    method: "POST",
    headers,
    body: serialized,
  });
}

export async function submitPolymarketOrder(input: {
  privyUserId: string;
  privyWalletId: string;
  address: string;
  workflowId: string;
  intent: PolymarketOrderIntent;
}): Promise<PolymarketOrderResult> {
  await assertKillSwitchClear(input.workflowId);

  const account = await getWarmPrivyViemAccount({
    privyUserId: input.privyUserId,
    privyWalletId: input.privyWalletId,
    address: input.address,
  });

  if (isCanvasRuntimeMock()) {
    const orderId = `mock-pm-${randomUUID().slice(0, 8)}`;
    const txHash = `0x${randomUUID().replace(/-/g, "").slice(0, 64)}`;
    void account;
    return {
      order_id: orderId,
      status: "mock",
      mock: true,
      tx_hash: txHash,
      explorer_url: `https://polygonscan.com/tx/${txHash}`,
      fill_price: input.intent.price ?? 0.5,
    };
  }

  const creds = await derivePolymarketL2Credentials({
    privyUserId: input.privyUserId,
    privyWalletId: input.privyWalletId,
    address: input.address,
  });

  const builderCode = getPolymarketBuilderCode();
  const payload: Record<string, unknown> = {
    token_id: input.intent.token_id,
    side: input.intent.side,
    size: String(input.intent.size),
    type: input.intent.order_type === "market" ? "FOK" : "GTC",
    ...(input.intent.price != null ? { price: String(input.intent.price) } : {}),
    ...(builderCode ? { builder_code: builderCode } : {}),
  };

  const response = await authenticatedPost(creds, "/order", payload);
  if (!response.ok) {
    const text = await response.text();
    throw new AppError(
      response.status,
      "POLYMARKET_ORDER_FAILED",
      `Polymarket order submit failed (${response.status}): ${text.slice(0, 200)}`,
    );
  }

  const body = (await response.json()) as { orderID?: string; order_id?: string; status?: string };
  const orderId = body.orderID ?? body.order_id ?? randomUUID();

  return {
    order_id: orderId,
    status: "submitted",
    fill_price: input.intent.price,
  };
}

/** Test hook */
export function setPolymarketOrderFetchForTests(fn: typeof fetchImpl | null): void {
  fetchImpl = fn ?? ((...args) => fetch(...args));
}

export function resetPolymarketOrderClientForTests(): void {
  fetchImpl = (...args) => fetch(...args);
}
