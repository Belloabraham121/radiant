import { getRedisClient } from "../../../infrastructure/redis/client.js";
import {
  bookEventToSnapshot,
  normalizePmBestBidAskMessage,
  normalizePmBookMessage,
  normalizePmTradeMessage,
  type NormalizedPmBookEvent,
  type NormalizedPmTradeEvent,
} from "./normalize/event-normalizer.js";
import {
  MDS_STREAM_MAXLEN,
  MDS_TRADE_STREAM_MAXLEN,
  pmBookStreamKey,
  pmTradeStreamKey,
} from "./normalize/stream-keys.js";
import { setBookSnapshot } from "./cache/book-snapshot-cache.js";

const memoryStreams = new Map<string, string[]>();

async function appendStream(key: string, payload: unknown, maxLen: number): Promise<void> {
  const serialized = JSON.stringify(payload);
  const redis = getRedisClient();
  if (redis) {
    try {
      await redis.xadd(key, "MAXLEN", "~", String(maxLen), "*", "data", serialized);
      return;
    } catch {
      // fall through to memory
    }
  }

  const rows = memoryStreams.get(key) ?? [];
  rows.push(serialized);
  if (rows.length > maxLen) {
    rows.splice(0, rows.length - maxLen);
  }
  memoryStreams.set(key, rows);
}

export async function publishPmBookEvent(event: NormalizedPmBookEvent): Promise<void> {
  await appendStream(pmBookStreamKey(event.asset_id), event, MDS_STREAM_MAXLEN);
  await setBookSnapshot(bookEventToSnapshot(event));
}

export async function publishPmTradeEvent(event: NormalizedPmTradeEvent): Promise<void> {
  await appendStream(pmTradeStreamKey(event.asset_id), event, MDS_TRADE_STREAM_MAXLEN);
}

export async function ingestPolymarketWsPayload(
  assetId: string,
  payload: Record<string, unknown>,
): Promise<void> {
  const eventType = String(payload.event_type ?? payload.type ?? "book");

  if (eventType === "price_change" && Array.isArray(payload.price_changes)) {
    for (const row of payload.price_changes) {
      if (!row || typeof row !== "object") continue;
      const change = row as Record<string, unknown>;
      const changeAssetId = String(change.asset_id ?? assetId);
      if (!changeAssetId) continue;
      const top = normalizePmBestBidAskMessage(changeAssetId, {
        ...change,
        event_type: "price_change",
      });
      if (top) await publishPmBookEvent(top);
    }
    return;
  }

  if (eventType === "last_trade_price" || eventType === "trade") {
    const trade = normalizePmTradeMessage(assetId, payload);
    if (trade) await publishPmTradeEvent(trade);
    return;
  }

  if (eventType === "best_bid_ask") {
    const top = normalizePmBestBidAskMessage(assetId, payload);
    if (top) await publishPmBookEvent(top);
    return;
  }

  const book = normalizePmBookMessage(assetId, payload);
  if (book) await publishPmBookEvent(book);
}

export async function readLatestPmBookEvent(assetId: string): Promise<NormalizedPmBookEvent | null> {
  const key = pmBookStreamKey(assetId);
  const redis = getRedisClient();
  if (redis) {
    try {
      const rows = await redis.xrevrange(key, "+", "-", "COUNT", 1);
      const entry = rows[0]?.[1];
      const dataIdx = entry?.indexOf("data") ?? -1;
      if (dataIdx >= 0 && entry?.[dataIdx + 1]) {
        return JSON.parse(entry[dataIdx + 1]) as NormalizedPmBookEvent;
      }
    } catch {
      // fall through
    }
  }

  const mem = memoryStreams.get(key);
  if (!mem || mem.length === 0) return null;
  return JSON.parse(mem[mem.length - 1]!) as NormalizedPmBookEvent;
}

/** Test hook */
export function clearMarketDataStreamsForTests(): void {
  memoryStreams.clear();
}
