import { apiFetch } from "@/lib/api";

export type CanvasNodePreviewPriceChart = {
  kind: "price_chart";
  ready: true;
  coin_id: string;
  interval: string;
  chart_type: string;
  points: Array<{ time: number; open: number; high: number; low: number; close: number }>;
  last_close: number | null;
  pct_change: number | null;
  updated_at: string;
};

export type CanvasNodePreviewPolymarketFeed = {
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
};

export type CanvasNodePreviewNotReady = {
  kind: "unsupported" | "not_ready";
  ready: false;
  reason: string;
};

export type CanvasNodePreview =
  | CanvasNodePreviewPriceChart
  | CanvasNodePreviewPolymarketFeed
  | CanvasNodePreviewNotReady;

export async function fetchCanvasNodePreview(
  workflowId: string,
  nodeId: string,
): Promise<CanvasNodePreview> {
  return apiFetch<CanvasNodePreview>(
    `/api/v1/canvas/workflows/${workflowId}/nodes/${nodeId}/preview`,
  );
}
