"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { AgentChainId } from "@/lib/agent-chains";
import { subscribeWalletAssetsInvalidation } from "@/lib/wallet-assets-events";
import { fetchWalletAssets, type WalletAssetsData } from "@/lib/wallet-assets-api";
import {
  readWalletAssetsCache,
  walletAssetsCacheKey,
  writeWalletAssetsCache,
} from "@/lib/wallet-session-cache";

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
  const [data, setData] = useState<WalletAssetsData | null>(
    () => readWalletAssetsCache(cacheKey) ?? null,
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fetchedRef = useRef(readWalletAssetsCache(cacheKey) !== undefined);

  const reload = useCallback(async () => {
    if (!enabled) return;
    setLoading(true);
    setError(null);
    try {
      const result = await fetchWalletAssets(chainId, {
        evmChainId,
        includeZero: true,
        includeUsd: true,
      });
      writeWalletAssetsCache(cacheKey, result);
      setData(result);
      fetchedRef.current = true;
    } catch (err) {
      fetchedRef.current = false;
      setError(err instanceof Error ? err.message : "Could not load wallet assets.");
    } finally {
      setLoading(false);
    }
  }, [cacheKey, chainId, enabled, evmChainId]);

  const loadIfNeeded = useCallback(async () => {
    if (!enabled) return;

    const cached = readWalletAssetsCache(cacheKey);
    if (cached) {
      setData(cached);
      fetchedRef.current = true;
      setError(null);
      return;
    }

    if (fetchedRef.current) return;
    await reload();
  }, [cacheKey, enabled, reload]);

  useEffect(() => {
    const cached = readWalletAssetsCache(cacheKey);
    if (cached) {
      setData(cached);
      fetchedRef.current = true;
    }
  }, [cacheKey]);

  useEffect(
    () =>
      subscribeWalletAssetsInvalidation((invalidatedChain) => {
        if (invalidatedChain !== chainId) return;
        fetchedRef.current = false;
        void reload();
      }),
    [chainId, reload],
  );

  return { data, loading, error, reload, loadIfNeeded };
}
