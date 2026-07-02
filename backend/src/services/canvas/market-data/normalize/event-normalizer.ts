import type { PolymarketBookLevel, PolymarketBookSnapshot } from "../../adapters/polymarket/polymarket.types.js";

export type NormalizedPmBookEvent = {
  asset_id: string;
  event_type: "book" | "price_change" | "best_bid_ask";
  bids: PolymarketBookLevel[];
  asks: PolymarketBookLevel[];
  best_bid: number | null;
  best_ask: number | null;
  mid: number | null;
  spread: number | null;
  updated_at: string;
};

export type NormalizedPmTradeEvent = {
  asset_id: string;
  event_type: "last_trade_price";
  price: number;
  size: number;
  side: "buy" | "sell" | "unknown";
  updated_at: string;
};

function parseLevel(raw: { price?: string; size?: string }): PolymarketBookLevel | null {
  const price = Number.parseFloat(raw.price ?? "");
  const size = Number.parseFloat(raw.size ?? "");
  if (!Number.isFinite(price) || !Number.isFinite(size)) return null;
  return { price, size };
}

function topOfBook(levels: PolymarketBookLevel[]): number | null {
  return levels.length > 0 ? levels[0]!.price : null;
}

export function normalizePmBookMessage(
  assetId: string,
  payload: Record<string, unknown>,
): NormalizedPmBookEvent | null {
  const bidsRaw = Array.isArray(payload.bids) ? payload.bids : [];
  const asksRaw = Array.isArray(payload.asks) ? payload.asks : [];

  const bids = bidsRaw
    .map((row) => parseLevel(row as { price?: string; size?: string }))
    .filter((row): row is PolymarketBookLevel => row !== null);
  const asks = asksRaw
    .map((row) => parseLevel(row as { price?: string; size?: string }))
    .filter((row): row is PolymarketBookLevel => row !== null);

  if (bids.length === 0 && asks.length === 0) return null;

  const bestBid = topOfBook(bids);
  const bestAsk = topOfBook(asks);
  const mid =
    bestBid !== null && bestAsk !== null ? (bestBid + bestAsk) / 2 : (bestBid ?? bestAsk);
  const spread =
    bestBid !== null && bestAsk !== null ? Math.max(0, bestAsk - bestBid) : null;

  const eventTypeRaw = typeof payload.event_type === "string" ? payload.event_type : "book";

  return {
    asset_id: assetId,
    event_type:
      eventTypeRaw === "price_change" || eventTypeRaw === "best_bid_ask"
        ? eventTypeRaw
        : "book",
    bids,
    asks,
    best_bid: bestBid,
    best_ask: bestAsk,
    mid,
    spread,
    updated_at: new Date().toISOString(),
  };
}

/** Top-of-book from `best_bid_ask` or `price_change` rows (no full depth). */
export function normalizePmBestBidAskMessage(
  assetId: string,
  payload: Record<string, unknown>,
): NormalizedPmBookEvent | null {
  const bestBidRaw = payload.best_bid ?? payload.bestBid;
  const bestAskRaw = payload.best_ask ?? payload.bestAsk;
  const bestBid =
    bestBidRaw !== undefined && bestBidRaw !== "" && bestBidRaw !== "0"
      ? Number.parseFloat(String(bestBidRaw))
      : null;
  const bestAsk =
    bestAskRaw !== undefined && bestAskRaw !== "" && bestAskRaw !== "0"
      ? Number.parseFloat(String(bestAskRaw))
      : null;

  if (bestBid === null && bestAsk === null) return null;
  if (bestBid !== null && !Number.isFinite(bestBid)) return null;
  if (bestAsk !== null && !Number.isFinite(bestAsk)) return null;

  const bids =
    bestBid !== null ? [{ price: bestBid, size: 0 }] : [];
  const asks =
    bestAsk !== null ? [{ price: bestAsk, size: 0 }] : [];
  const mid =
    bestBid !== null && bestAsk !== null ? (bestBid + bestAsk) / 2 : (bestBid ?? bestAsk);
  const spread =
    bestBid !== null && bestAsk !== null ? Math.max(0, bestAsk - bestBid) : null;

  const eventTypeRaw = typeof payload.event_type === "string" ? payload.event_type : "best_bid_ask";

  return {
    asset_id: assetId,
    event_type: eventTypeRaw === "price_change" ? "price_change" : "best_bid_ask",
    bids,
    asks,
    best_bid: bestBid,
    best_ask: bestAsk,
    mid,
    spread,
    updated_at: new Date().toISOString(),
  };
}

export function normalizePmTradeMessage(
  assetId: string,
  payload: Record<string, unknown>,
): NormalizedPmTradeEvent | null {
  const price = Number.parseFloat(String(payload.price ?? payload.last_trade_price ?? ""));
  const size = Number.parseFloat(String(payload.size ?? payload.last_trade_size ?? "0"));
  if (!Number.isFinite(price)) return null;

  const sideRaw = String(payload.side ?? "unknown").toLowerCase();
  const side: NormalizedPmTradeEvent["side"] =
    sideRaw === "buy" || sideRaw === "sell" ? sideRaw : "unknown";

  return {
    asset_id: assetId,
    event_type: "last_trade_price",
    price,
    size: Number.isFinite(size) ? size : 0,
    side,
    updated_at: new Date().toISOString(),
  };
}

export function bookEventToSnapshot(event: NormalizedPmBookEvent): PolymarketBookSnapshot {
  return {
    asset_id: event.asset_id,
    bids: event.bids,
    asks: event.asks,
    best_bid: event.best_bid,
    best_ask: event.best_ask,
    mid: event.mid,
    spread: event.spread,
    updated_at: event.updated_at,
  };
}
