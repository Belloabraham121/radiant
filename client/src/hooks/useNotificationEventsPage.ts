"use client";

import { useCallback, useEffect, useState } from "react";
import {
  listNotificationEvents,
  type NotificationEventRecord,
} from "@/lib/notifications-api";

export type NotificationInboxFilters = {
  unread?: boolean;
};

export function useNotificationEventsPage(
  filters: NotificationInboxFilters,
  page = 1,
  limit = 20,
  enabled = true,
) {
  const [items, setItems] = useState<NotificationEventRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!enabled) return;
    setLoading(true);
    setError(null);

    try {
      const data = await listNotificationEvents({
        unread: filters.unread,
        limit,
        offset: (page - 1) * limit,
      });
      setItems(data.events);
      setTotal(data.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load notifications.");
      setItems([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [enabled, filters.unread, limit, page]);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    void listNotificationEvents({
      unread: filters.unread,
      limit,
      offset: (page - 1) * limit,
    })
      .then((data) => {
        if (cancelled) return;
        setItems(data.events);
        setTotal(data.total);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Could not load notifications.");
          setItems([]);
          setTotal(0);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [enabled, filters.unread, limit, page]);

  return {
    items,
    pagination: { page, limit, total },
    loading,
    error,
    reload,
  };
}
