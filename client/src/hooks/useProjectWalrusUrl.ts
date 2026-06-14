"use client";

import { useCallback, useEffect, useState } from "react";
import { isMockWalrusSiteUrl } from "@/lib/deploy-api";
import { fetchProjectMeta } from "@/lib/projects-api";

const storageKey = (projectId: string) => `radiant:walrus-url:${projectId}`;

function readCachedUrl(projectId: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    const cached = sessionStorage.getItem(storageKey(projectId));
    if (cached && !isMockWalrusSiteUrl(cached)) return cached;
  } catch {
    // ignore quota / private mode
  }
  return null;
}

function writeCachedUrl(projectId: string, url: string | null): void {
  if (typeof window === "undefined") return;
  try {
    if (url && !isMockWalrusSiteUrl(url)) {
      sessionStorage.setItem(storageKey(projectId), url);
    } else {
      sessionStorage.removeItem(storageKey(projectId));
    }
  } catch {
    // ignore
  }
}

/** Loads persisted Walrus site URL for a project (API + sessionStorage cache). */
export function useProjectWalrusUrl(projectId?: string) {
  const [liveUrl, setLiveUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!projectId) {
      setLiveUrl(null);
      return null;
    }

    setLoading(true);
    try {
      const meta = await fetchProjectMeta(projectId);
      const url =
        meta.walrus_url && !isMockWalrusSiteUrl(meta.walrus_url) ? meta.walrus_url : null;
      setLiveUrl(url);
      writeCachedUrl(projectId, url);
      return url;
    } catch {
      const cached = readCachedUrl(projectId);
      setLiveUrl(cached);
      return cached;
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    if (!projectId) {
      setLiveUrl(null);
      return;
    }

    const cached = readCachedUrl(projectId);
    if (cached) setLiveUrl(cached);

    void refresh();
  }, [projectId, refresh]);

  const setUrl = useCallback(
    (url: string | null) => {
      if (!projectId) return;
      const next = url && !isMockWalrusSiteUrl(url) ? url : null;
      setLiveUrl(next);
      writeCachedUrl(projectId, next);
    },
    [projectId],
  );

  return { liveUrl, loading, refresh, setUrl };
}
