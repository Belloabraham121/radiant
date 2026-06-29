/** Redis stream / cache key conventions for Canvas market data service. */

export function pmBookStreamKey(assetId: string): string {
  return `mds:pm:book:${assetId}`;
}

export function pmTradeStreamKey(assetId: string): string {
  return `mds:pm:trade:${assetId}`;
}

export function pmBookSnapshotKey(assetId: string): string {
  return `mds:pm:snapshot:book:${assetId}`;
}

export function cgPriceStreamKey(coinId: string): string {
  return `mds:cg:price:${coinId}`;
}

export function cgChartCacheKey(coinId: string, interval: string): string {
  return `mds:cg:chart:${coinId}:${interval}`;
}

export const MDS_STREAM_MAXLEN = 1000;
export const MDS_TRADE_STREAM_MAXLEN = 500;
