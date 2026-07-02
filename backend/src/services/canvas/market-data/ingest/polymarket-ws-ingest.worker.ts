/**
 * Polymarket market-channel WS ingest.
 * @see https://docs.polymarket.com/market-data/websocket/overview
 * @see https://docs.polymarket.com/market-data/websocket/market-channel
 */
import { AppError } from "../../../../errors/app-error.js";
import { logger } from "../../../../shared/logger.js";
import { getPolymarketConfig } from "../../adapters/polymarket/polymarket.config.js";
import { fetchPolymarketBook } from "../../adapters/polymarket/polymarket-rest.client.js";
import { ingestPolymarketWsPayload, publishPmBookEvent } from "../market-data.service.js";
import { normalizePmBookMessage } from "../normalize/event-normalizer.js";

const subscribedAssets = new Set<string>();
/** Log stale-token seed failures once per process to avoid spam on closed markets. */
const restSeedNotFoundLogged = new Set<string>();
let ws: WebSocket | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let pingTimer: ReturnType<typeof setInterval> | null = null;
let mockTimer: ReturnType<typeof setInterval> | null = null;
let started = false;

function clearTimers(): void {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  if (pingTimer) {
    clearInterval(pingTimer);
    pingTimer = null;
  }
  if (mockTimer) {
    clearInterval(mockTimer);
    mockTimer = null;
  }
}

async function seedBookFromRest(assetId: string): Promise<void> {
  try {
    const book = await fetchPolymarketBook(assetId);
    const event = normalizePmBookMessage(assetId, {
      event_type: "book",
      bids: book.bids.map((l) => ({ price: String(l.price), size: String(l.size) })),
      asks: book.asks.map((l) => ({ price: String(l.price), size: String(l.size) })),
    });
    if (event) await publishPmBookEvent(event);
  } catch (err) {
    const notFound =
      err instanceof AppError && err.code === "POLYMARKET_TOKEN_NOT_FOUND";
    if (notFound) {
      if (!restSeedNotFoundLogged.has(assetId)) {
        restSeedNotFoundLogged.add(assetId);
        logger.info("Polymarket REST book seed skipped — token not on CLOB", {
          asset_id: assetId,
          hint: "Market may be closed/resolved. Update the feed node asset_id via market search.",
        });
      }
      return;
    }
    logger.warn("Polymarket REST book seed failed", {
      asset_id: assetId,
      message: err instanceof Error ? err.message : String(err),
    });
  }
}

function startMockIngest(): void {
  if (mockTimer) return;
  mockTimer = setInterval(() => {
    for (const assetId of subscribedAssets) {
      const mid = 0.45 + Math.random() * 0.1;
      const spread = 0.01;
      void ingestPolymarketWsPayload(assetId, {
        event_type: "book",
        bids: [
          { price: String(mid - spread / 2), size: String(1000 + Math.random() * 5000) },
          { price: String(mid - spread), size: String(800 + Math.random() * 2000) },
        ],
        asks: [
          { price: String(mid + spread / 2), size: String(900 + Math.random() * 4000) },
          { price: String(mid + spread), size: String(700 + Math.random() * 2500) },
        ],
      });
    }
  }, 3000);
}

/** Initial subscription after connect — subscribe to all tracked asset IDs. */
function sendInitialSubscription(): void {
  if (!ws || ws.readyState !== WebSocket.OPEN || subscribedAssets.size === 0) return;
  ws.send(
    JSON.stringify({
      assets_ids: [...subscribedAssets],
      type: "market",
      custom_feature_enabled: true,
    }),
  );
}

/** Dynamic subscribe for newly added assets without reconnecting. */
function sendDynamicSubscribe(assetIds: string[]): void {
  if (!ws || ws.readyState !== WebSocket.OPEN || assetIds.length === 0) return;
  ws.send(
    JSON.stringify({
      assets_ids: assetIds,
      operation: "subscribe",
      custom_feature_enabled: true,
    }),
  );
}

function scheduleReconnect(): void {
  if (reconnectTimer) return;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connectWs();
  }, 5000);
}

function handleWsMessage(text: string): void {
  if (text === "PONG") return;
  try {
    const payload = JSON.parse(text) as Record<string, unknown>;
    const eventType = String(payload.event_type ?? payload.type ?? "");

    if (eventType === "price_change" && Array.isArray(payload.price_changes)) {
      void ingestPolymarketWsPayload("", payload);
      return;
    }

    const assetId = String(payload.asset_id ?? "");
    if (!assetId) return;
    void ingestPolymarketWsPayload(assetId, payload);
  } catch {
    // ignore malformed frames
  }
}

function connectWs(): void {
  const config = getPolymarketConfig();
  if (config.ingestMock) {
    startMockIngest();
    return;
  }

  const WebSocketCtor = globalThis.WebSocket;
  if (!WebSocketCtor) {
    logger.warn("WebSocket unavailable — Polymarket ingest using mock stream");
    startMockIngest();
    return;
  }

  if (ws) {
    ws.close();
    ws = null;
  }

  ws = new WebSocketCtor(config.wsUrl);

  ws.addEventListener("open", () => {
    logger.info("Polymarket WS ingest connected", { region: config.ingestRegion });
    sendInitialSubscription();
    pingTimer = setInterval(() => {
      if (ws?.readyState === WebSocket.OPEN) {
        ws.send("PING");
      }
    }, 10_000);
  });

  ws.addEventListener("message", (event) => {
    const text = typeof event.data === "string" ? event.data : "";
    handleWsMessage(text);
  });

  ws.addEventListener("close", () => {
    clearTimers();
    scheduleReconnect();
  });

  ws.addEventListener("error", () => {
    logger.warn("Polymarket WS ingest error");
  });
}

export function ensurePolymarketIngestWorker(): void {
  if (started) return;
  started = true;
  const config = getPolymarketConfig();
  if (!config.enabled && !config.ingestMock) return;
  connectWs();
}

export async function subscribePolymarketAsset(assetId: string): Promise<void> {
  const trimmed = assetId.trim();
  if (!trimmed || subscribedAssets.has(trimmed)) return;
  subscribedAssets.add(trimmed);
  ensurePolymarketIngestWorker();
  await seedBookFromRest(trimmed);
  if (ws?.readyState === WebSocket.OPEN) {
    sendDynamicSubscribe([trimmed]);
  }
}

/** Test hook */
export function resetPolymarketIngestWorkerForTests(): void {
  clearTimers();
  if (ws) {
    ws.close();
    ws = null;
  }
  subscribedAssets.clear();
  restSeedNotFoundLogged.clear();
  started = false;
}
