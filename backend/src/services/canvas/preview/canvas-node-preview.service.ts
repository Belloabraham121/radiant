import { AppError } from "../../../errors/app-error.js";
import { fetchPolymarketBook, fetchPolymarketPrice } from "../adapters/polymarket/polymarket-rest.client.js";
import { getPolymarketConfig } from "../adapters/polymarket/polymarket.config.js";
import { getUserWorkflow } from "../canvas-workflow.service.js";
import type { CanvasNode } from "../graph/canvas-graph.types.js";
import { fetchCoinGeckoChartSnapshot } from "../market-data/coingecko-chart.service.js";
import { getBookSnapshot } from "../market-data/cache/book-snapshot-cache.js";
import { subscribePolymarketAsset } from "../market-data/ingest/polymarket-ws-ingest.worker.js";
import { readLatestPmBookEvent } from "../market-data/market-data.service.js";

export type CanvasNodePreviewPayload =
  | {
      kind: "price_chart";
      ready: true;
      coin_id: string;
      interval: string;
      chart_type: string;
      points: Array<{ time: number; open: number; high: number; low: number; close: number }>;
      last_close: number | null;
      pct_change: number | null;
      updated_at: string;
    }
  | {
      kind: "polymarket_feed";
      ready: true;
      asset_id: string;
      connection: "online" | "mock" | "rest";
      book: {
        bids: Array<{ price: number; size: number }>;
        asks: Array<{ price: number; size: number }>;
        best_bid: number | null;
        best_ask: number | null;
        mid: number | null;
        spread: number | null;
      };
      last_trade: { price: number; size: number; side: string } | null;
      updated_at: string;
    }
  | {
      kind: "unsupported" | "not_ready";
      ready: false;
      reason: string;
    };

function findWorkflowNode(
  graphNodes: CanvasNode[],
  nodeId: string,
): CanvasNode | undefined {
  return graphNodes.find((n) => n.id === nodeId);
}

function configString(config: Record<string, unknown>, key: string): string | null {
  const value = config[key];
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
}

function configNumber(config: Record<string, unknown>, key: string, fallback: number): number {
  const raw = config[key];
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  if (typeof raw === "string") {
    const parsed = Number.parseInt(raw, 10);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

async function previewPriceChart(node: CanvasNode): Promise<CanvasNodePreviewPayload> {
  const config = node.config;
  const pair = configString(config, "pair");
  const coinId = configString(config, "coin_id");
  const interval = configString(config, "interval") ?? "1d";
  const chartType = configString(config, "chart_type") ?? "candlestick";

  if (!pair && !coinId) {
    return { kind: "not_ready", ready: false, reason: "Set a trading pair or coin id." };
  }

  const snapshot = await fetchCoinGeckoChartSnapshot({ coinId: coinId ?? undefined, pair: pair ?? undefined, interval });
  if (!snapshot || snapshot.points.length === 0) {
    return { kind: "not_ready", ready: false, reason: "Chart data unavailable — check CoinGecko config." };
  }

  const first = snapshot.points[0]!;
  const last = snapshot.points[snapshot.points.length - 1]!;
  const pctChange =
    first.close > 0 ? ((last.close - first.close) / first.close) * 100 : null;

  return {
    kind: "price_chart",
    ready: true,
    coin_id: snapshot.coin_id,
    interval: snapshot.interval,
    chart_type: chartType,
    points: snapshot.points,
    last_close: last.close,
    pct_change: pctChange,
    updated_at: snapshot.updated_at,
  };
}

async function previewPolymarketFeed(node: CanvasNode): Promise<CanvasNodePreviewPayload> {
  const config = node.config;
  const assetId =
    configString(config, "asset_id") ??
    configString(config, "market") ??
    configString(config, "token_id");
  const depth = configNumber(config, "depth", 5);

  if (!assetId) {
    return { kind: "not_ready", ready: false, reason: "Set a Polymarket asset / market id." };
  }

  const pmConfig = getPolymarketConfig();
  if (pmConfig.enabled || pmConfig.ingestMock) {
    await subscribePolymarketAsset(assetId);
  }

  let snapshot = await getBookSnapshot(assetId);
  if (!snapshot) {
    const streamEvent = await readLatestPmBookEvent(assetId);
    if (streamEvent) {
      snapshot = {
        asset_id: assetId,
        bids: streamEvent.bids,
        asks: streamEvent.asks,
        best_bid: streamEvent.best_bid,
        best_ask: streamEvent.best_ask,
        mid: streamEvent.mid,
        spread: streamEvent.spread,
        updated_at: streamEvent.updated_at,
      };
    }
  }

  if (!snapshot && pmConfig.enabled) {
    try {
      snapshot = await fetchPolymarketBook(assetId);
    } catch {
      // fall through to not_ready
    }
  }

  if (!snapshot) {
    return { kind: "not_ready", ready: false, reason: "Order book preview unavailable." };
  }

  let lastTrade: { price: number; size: number; side: string } | null = null;
  if (pmConfig.enabled) {
    try {
      const quote = await fetchPolymarketPrice(assetId);
      if (quote.price !== null) {
        lastTrade = { price: quote.price, size: 0, side: "unknown" };
      }
    } catch {
      // optional enrichment
    }
  }

  const connection: "online" | "mock" | "rest" = pmConfig.ingestMock
    ? "mock"
    : pmConfig.enabled
      ? "online"
      : "rest";

  return {
    kind: "polymarket_feed",
    ready: true,
    asset_id: assetId,
    connection,
    book: {
      bids: snapshot.bids.slice(0, depth),
      asks: snapshot.asks.slice(0, depth),
      best_bid: snapshot.best_bid,
      best_ask: snapshot.best_ask,
      mid: snapshot.mid,
      spread: snapshot.spread,
    },
    last_trade: lastTrade,
    updated_at: snapshot.updated_at,
  };
}

export async function getCanvasNodePreview(
  privyUserId: string,
  workflowId: string,
  nodeId: string,
): Promise<CanvasNodePreviewPayload> {
  const workflow = await getUserWorkflow(privyUserId, workflowId);
  const node = findWorkflowNode(workflow.graph.nodes, nodeId);
  if (!node) {
    throw new AppError(404, "NODE_NOT_FOUND", "Canvas node not found.");
  }

  const nodeType = node.type as string;
  if (nodeType === "price_chart") {
    return previewPriceChart(node);
  }
  if (nodeType === "polymarket_feed" || nodeType === "polymarket_market") {
    return previewPolymarketFeed(node);
  }
  return { kind: "unsupported", ready: false, reason: "Preview not available for this node type." };
}
