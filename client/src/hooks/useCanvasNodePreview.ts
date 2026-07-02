"use client";

import { useEffect, useRef, useState } from "react";
import {
  fetchCanvasNodePreview,
  type CanvasNodePreview,
} from "@/lib/canvas-preview-api";

const PREVIEW_POLL_MS = 5000;

export function useCanvasNodePreview(
  workflowId: string | null | undefined,
  nodeId: string | null | undefined,
  enabled: boolean,
): {
  preview: CanvasNodePreview | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
} {
  const [preview, setPreview] = useState<CanvasNodePreview | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlightRef = useRef(false);

  const refresh = async () => {
    if (!workflowId || !nodeId || !enabled || inFlightRef.current) return;
    inFlightRef.current = true;
    setLoading(true);
    setError(null);
    try {
      const data = await fetchCanvasNodePreview(workflowId, nodeId);
      setPreview(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Preview unavailable");
    } finally {
      inFlightRef.current = false;
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!workflowId || !nodeId || !enabled) {
      setPreview(null);
      setError(null);
      setLoading(false);
      return;
    }

    void refresh();
    const timer = window.setInterval(() => {
      void refresh();
    }, PREVIEW_POLL_MS);

    return () => {
      window.clearInterval(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workflowId, nodeId, enabled]);

  return { preview, loading, error, refresh };
}

/** True when node config has minimum fields for live preview fetch. */
export function isPreviewConfigReady(
  nodeType: string | undefined,
  values: Record<string, unknown> | undefined,
): boolean {
  if (!values) return false;
  const str = (key: string) => {
    const v = values[key];
    return typeof v === "string" && v.trim().length > 0;
  };

  if (nodeType === "price-chart" || nodeType === "price_chart") {
    return str("pair") || str("coin_id");
  }
  if (
    nodeType === "polymarket-market" ||
    nodeType === "polymarket_feed" ||
    nodeType === "polymarket-feed"
  ) {
    return str("asset_id") || str("market") || str("token_id");
  }
  return false;
}
