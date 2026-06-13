"use client";

import { useCallback, useEffect, useState } from "react";
import {
  getAgentTransaction,
  listAgentTransactions,
  type AgentTransactionDetail,
  type AgentTransactionListItem,
} from "@/lib/agent-transactions-api";

export function useAgentRecentTransactions(limit = 8, enabled = true) {
  const [items, setItems] = useState<AgentTransactionListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!enabled) return;
    setLoading(true);
    setError(null);
    try {
      const data = await listAgentTransactions({ page: 1, limit });
      setItems(data.items);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load activity.");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [enabled, limit]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { items, loading, error, reload };
}

export function useAgentTransactionDetail(transactionId: string | null, open: boolean) {
  const [detail, setDetail] = useState<AgentTransactionDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !transactionId) {
      setDetail(null);
      setError(null);
      return;
    }

    const id = transactionId;
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const data = await getAgentTransaction(id);
        if (!cancelled) {
          setDetail(data);
        }
      } catch (err) {
        if (!cancelled) {
          setDetail(null);
          setError(err instanceof Error ? err.message : "Could not load transaction.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, [open, transactionId]);

  return { detail, loading, error };
}
