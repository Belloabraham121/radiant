"use client";

import { useCallback, useEffect, useState } from "react";
import {
  getAgentTransaction,
  listAgentTransactions,
  type AgentTransactionCategory,
  type AgentTransactionDetail,
  type AgentTransactionListItem,
  type AgentTransactionStatus,
  type ListAgentTransactionsQuery,
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
};

export type AgentActivityFilters = {
  status?: AgentTransactionStatus;
  category?: AgentTransactionCategory;
};

export function useAgentTransactionsPage(
  filters: AgentActivityFilters,
  page = 1,
  limit = 20,
  enabled = true,
) {
  const [items, setItems] = useState<AgentTransactionListItem[]>([]);
  const [pagination, setPagination] = useState({ page: 1, limit, total: 0 });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!enabled) return;
    setLoading(true);
    setError(null);

    const query: ListAgentTransactionsQuery = { page, limit };
    if (filters.status) query.status = filters.status;
    if (filters.category) query.category = filters.category;

    try {
      const data = await listAgentTransactions(query);
      setItems(data.items);
      setPagination(data.meta.pagination);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load transactions.");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [enabled, filters.category, filters.status, limit, page]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { items, pagination, loading, error, reload };
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
