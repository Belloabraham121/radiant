import { getDeepBookEnv } from "../../config/deepbook.js";
import type { IndexerAssetRecord } from "./token-catalog.types.js";

export type IndexerAssetsResponse = Record<string, IndexerAssetRecord>;

export async function fetchIndexerAssets(
  indexerUrl = getDeepBookEnv().indexerUrl,
): Promise<IndexerAssetsResponse> {
  const url = `${indexerUrl.replace(/\/$/, "")}/assets`;
  const response = await fetch(url, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(15_000),
  });

  if (!response.ok) {
    throw new Error(`DeepBook indexer /assets failed: HTTP ${response.status}`);
  }

  const body = (await response.json()) as IndexerAssetsResponse;
  if (!body || typeof body !== "object") {
    throw new Error("DeepBook indexer /assets returned invalid JSON");
  }

  return body;
}
