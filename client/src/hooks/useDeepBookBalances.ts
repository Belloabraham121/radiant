"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { fetchDeepBookManager, type DeepBookManagerUiData } from "@/lib/deepbook-api";
import {
  readDeepBookManagerCache,
  writeDeepBookManagerCache,
} from "@/lib/wallet-session-cache";

type UseDeepBookBalancesOptions = {
  enabled?: boolean;
};

export function useDeepBookBalances({ enabled = true }: UseDeepBookBalancesOptions = {}) {
  const [data, setData] = useState<DeepBookManagerUiData | null>(
    () => readDeepBookManagerCache() ?? null,
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fetchedRef = useRef(readDeepBookManagerCache() !== undefined);

  const reload = useCallback(async () => {
    if (!enabled) return;
    setLoading(true);
    setError(null);
    try {
      const result = await fetchDeepBookManager();
      writeDeepBookManagerCache(result);
      setData(result);
      fetchedRef.current = true;
    } catch (err) {
      fetchedRef.current = false;
      setError(err instanceof Error ? err.message : "Could not load DeepBook balances.");
    } finally {
      setLoading(false);
    }
  }, [enabled]);

  const loadIfNeeded = useCallback(async () => {
    if (!enabled) return;

    const cached = readDeepBookManagerCache();
    if (cached) {
      setData(cached);
      fetchedRef.current = true;
      setError(null);
      return;
    }

    if (fetchedRef.current) return;
    await reload();
  }, [enabled, reload]);

  useEffect(() => {
    const cached = readDeepBookManagerCache();
    if (cached) {
      setData(cached);
      fetchedRef.current = true;
    }
  }, []);

  return { data, loading, error, reload, loadIfNeeded };
}
