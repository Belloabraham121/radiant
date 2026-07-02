import { AppError } from "../../../../errors/app-error.js";
import { getPolymarketConfig } from "./polymarket.config.js";
import { consumePolymarketRestToken } from "./polymarket-rate-limit.js";
import type { PolymarketBookLevel, PolymarketBookSnapshot, PolymarketPriceQuote } from "./polymarket.types.js";

let fetchImpl: typeof globalThis.fetch = (...args) => fetch(...args);

function parseLevels(raw: unknown): PolymarketBookLevel[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((row) => {
      const price = Number.parseFloat(String((row as { price?: string }).price ?? ""));
      const size = Number.parseFloat(String((row as { size?: string }).size ?? ""));
      if (!Number.isFinite(price) || !Number.isFinite(size)) return null;
      return { price, size };
    })
    .filter((row): row is PolymarketBookLevel => row !== null);
}

async function polymarketFetch(path: string, searchParams?: Record<string, string>): Promise<Response> {
  const allowed = await consumePolymarketRestToken();
  if (!allowed) {
    throw new AppError(429, "RATE_LIMITED", "Polymarket REST rate limit exceeded.");
  }

  const config = getPolymarketConfig();
  const url = new URL(`${config.clobBaseUrl}${path}`);
  if (searchParams) {
    for (const [key, value] of Object.entries(searchParams)) {
      url.searchParams.set(key, value);
    }
  }

  return fetchImpl(url.toString(), {
    headers: { Accept: "application/json" },
  });
}

export async function fetchPolymarketBook(assetId: string): Promise<PolymarketBookSnapshot> {
  const response = await polymarketFetch("/book", { token_id: assetId });
  if (!response.ok) {
    const code =
      response.status === 404 ? "POLYMARKET_TOKEN_NOT_FOUND" : "POLYMARKET_BOOK_FAILED";
    const message =
      response.status === 404
        ? "Polymarket token not on CLOB (market may be closed or asset_id is stale)."
        : `Polymarket book request failed (${response.status}).`;
    throw new AppError(response.status, code, message);
  }

  const payload = (await response.json()) as Record<string, unknown>;
  const bids = parseLevels(payload.bids);
  const asks = parseLevels(payload.asks);
  const bestBid = bids[0]?.price ?? null;
  const bestAsk = asks[0]?.price ?? null;
  const mid =
    bestBid !== null && bestAsk !== null ? (bestBid + bestAsk) / 2 : (bestBid ?? bestAsk);
  const spread =
    bestBid !== null && bestAsk !== null ? Math.max(0, bestAsk - bestBid) : null;

  return {
    asset_id: assetId,
    bids,
    asks,
    best_bid: bestBid,
    best_ask: bestAsk,
    mid,
    spread,
    updated_at: new Date().toISOString(),
  };
}

export async function fetchPolymarketPrice(assetId: string): Promise<PolymarketPriceQuote> {
  const [priceRes, midRes] = await Promise.all([
    polymarketFetch("/price", { token_id: assetId, side: "buy" }),
    polymarketFetch("/midpoint", { token_id: assetId }),
  ]);

  let price: number | null = null;
  let midpoint: number | null = null;

  if (priceRes.ok) {
    const body = (await priceRes.json()) as { price?: string };
    const parsed = Number.parseFloat(body.price ?? "");
    price = Number.isFinite(parsed) ? parsed : null;
  }

  if (midRes.ok) {
    const body = (await midRes.json()) as { mid?: string };
    const parsed = Number.parseFloat(body.mid ?? "");
    midpoint = Number.isFinite(parsed) ? parsed : null;
  }

  return {
    asset_id: assetId,
    price,
    midpoint,
    updated_at: new Date().toISOString(),
  };
}

/** Test hook */
export function setPolymarketFetchForTests(fn: typeof fetchImpl | null): void {
  fetchImpl = fn ?? ((...args) => fetch(...args));
}

export function resetPolymarketClientForTests(): void {
  fetchImpl = (...args) => fetch(...args);
}
