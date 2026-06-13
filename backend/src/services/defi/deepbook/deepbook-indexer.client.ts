/** @deprecated Import from `./indexer/deepbook-indexer.client.js` */
export {
  fetchIndexerAssets,
  fetchIndexerOrderbook,
  fetchIndexerPools,
  fetchIndexerSummary,
  fetchIndexerTicker,
  fetchIndexerStatus,
  fetchIndexerTrades,
  fetchIndexerHistoricalVolume,
  fetchIndexerAllHistoricalVolume,
  fetchIndexerHistoricalVolumeByManager,
  fetchIndexerHistoricalVolumeByManagerInterval,
  fetchIndexerOhlcv,
  IndexerRequestError,
} from "./indexer/deepbook-indexer.client.js";

export type { IndexerAssetsResponse } from "./indexer/indexer.types.js";
