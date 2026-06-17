"use client";

import { useCallback, useEffect, useState } from "react";
import type { AgentChainId } from "@/lib/agent-chains";
import { subscribeWalletAssetsInvalidation } from "@/lib/wallet-assets-events";
import { fetchWalletAssets, type WalletAssetsData } from "@/lib/wallet-assets-api";
import {
  readWalletAssetsCache,
  walletAssetsCacheKey,
  writeWalletAssetsCache,
} from "@/lib/wallet-session-cache";
import {
  mergeAssetsWithCachedLogos,
  rememberAssetsMetadata,
} from "@/lib/token-metadata-cache";

function withPersistentTokenMetadata(data: WalletAssetsData): WalletAssetsData {
  rememberAssetsMetadata(data.assets);
  return {
    ...data,
    assets: mergeAssetsWithCachedLogos(data.assets),
  };
}

type UseWalletAssetsOptions = {
  chainId: AgentChainId;
  evmChainId?: number;
  enabled?: boolean;
};

export function useWalletAssets({
  chainId,
  evmChainId,
  enabled = true,
}: UseWalletAssetsOptions) {
  const cacheKey = walletAssetsCacheKey(chainId, evmChainId);
  const [data, setData] = useState<WalletAssetsData | null>(() => {
    const cached = readWalletAssetsCache(cacheKey);
    return cached ? withPersistentTokenMetadata(cached) : null;
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasFetched, setHasFetched] = useState(
    () => readWalletAssetsCache(cacheKey) !== undefined,
  );
  const [trackedCacheKey, setTrackedCacheKey] = useState(cacheKey);

  if (cacheKey !== trackedCacheKey) {
    setTrackedCacheKey(cacheKey);
    const cached = readWalletAssetsCache(cacheKey);
    setData(cached ? withPersistentTokenMetadata(cached) : null);
    setHasFetched(cached !== undefined);
  }

  const reload = useCallback(async () => {
    if (!enabled) return;
    setLoading(true);
    setError(null);
    try {
      const result = withPersistentTokenMetadata(
        await fetchWalletAssets(chainId, {
          evmChainId,
          includeZero: true,
          includeUsd: true,
        }),
      );
      writeWalletAssetsCache(cacheKey, result);
      setData(result);
      setHasFetched(true);
    } catch (err) {
      setHasFetched(false);
      setError(err instanceof Error ? err.message : "Could not load wallet assets.");
    } finally {
      setLoading(false);
    }
  }, [cacheKey, chainId, enabled, evmChainId]);

  const loadIfNeeded = useCallback(async () => {
    if (!enabled) return;

    const cached = readWalletAssetsCache(cacheKey);
    if (cached) {
      setData(withPersistentTokenMetadata(cached));
      setHasFetched(true);
      setError(null);
      return;
    }

    if (hasFetched) return;
    await reload();
  }, [cacheKey, enabled, hasFetched, reload]);

  useEffect(
    () =>
      subscribeWalletAssetsInvalidation((invalidatedChain) => {
        if (invalidatedChain !== chainId) return;
        setHasFetched(false);
        setData(null);
        void reload();
      }),
    [chainId, reload],
  );

  return { data, loading, error, reload, loadIfNeeded };
}
