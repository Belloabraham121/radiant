"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArtifactPreviewNavBar } from "@/components/app/ArtifactPreviewNavBar";
import { buildArtifactPreviewSrcdoc } from "@/lib/artifact-preview";
import { extractArtifactPreviewRoutes } from "@/lib/artifact-preview-routes";
import type { ArtifactFile } from "@/lib/artifact-types";
import {
  PREVIEW_API_REQUEST,
  PREVIEW_MESSAGE_TYPE,
  PREVIEW_NAVIGATE_TYPE,
  proxyPreviewApiRequest,
} from "@/lib/artifact-preview-bridge";
import { usePreviewAgentEventRelay } from "@/hooks/usePreviewAgentEventRelay";

function PreviewLoadingOverlay() {
  return (
    <div
      className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-4 bg-[var(--hero-bg)]"
      aria-live="polite"
      aria-busy="true"
    >
      <div className="flex items-center gap-2">
        <span
          className="size-2.5 rounded-full bg-[var(--hero-violet)] animate-bounce"
          style={{ animationDelay: "0ms" }}
        />
        <span
          className="size-2.5 rounded-full bg-[var(--hero-amber)] animate-bounce"
          style={{ animationDelay: "150ms" }}
        />
        <span
          className="size-2.5 rounded-full bg-[var(--hero-mint)] animate-bounce"
          style={{ animationDelay: "300ms" }}
        />
      </div>
      <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--hero-ink)]/45">
        Building preview…
      </p>
    </div>
  );
}

export function ArtifactPreview({
  files,
  revision,
  projectId,
  installationId,
  sessionId,
  onProxiedApiResponse,
}: {
  files: ArtifactFile[];
  revision: number;
  projectId?: string;
  installationId?: string;
  sessionId?: string;
  onProxiedApiResponse?: (status: number, body: string, path: string) => void;
}) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const previewPathRef = useRef("/");
  const [previewPath, setPreviewPath] = useState("/");
  const [refreshKey, setRefreshKey] = useState(0);
  const iframeKey = `${revision}-${refreshKey}`;
  const [readyIframeKey, setReadyIframeKey] = useState<string | null>(null);
  const loading = readyIframeKey !== iframeKey;
  const routes = useMemo(() => extractArtifactPreviewRoutes(files), [files]);
  const srcdoc = useMemo(
    () => buildArtifactPreviewSrcdoc(files, { projectId, installationId, sessionId }),
    [files, projectId, installationId, sessionId],
  );

  usePreviewAgentEventRelay(iframeRef, Boolean(projectId || installationId));

  useEffect(() => {
    previewPathRef.current = previewPath;
  }, [previewPath]);

  const postNavigate = useCallback((path: string) => {
    const win = iframeRef.current?.contentWindow;
    if (!win) return;
    win.postMessage({ type: PREVIEW_NAVIGATE_TYPE, path }, "*");
  }, []);

  useEffect(() => {
    function onMessage(event: MessageEvent) {
      const data = event.data as {
        type?: string;
        status?: string;
        path?: string;
        requestId?: string;
        method?: string;
        body?: string;
      } | null;

      if (data?.type === PREVIEW_API_REQUEST) {
        if (event.source !== iframeRef.current?.contentWindow) return;
        void (async () => {
          const { response, path } = await proxyPreviewApiRequest(
            {
              type: PREVIEW_API_REQUEST,
              requestId: data.requestId ?? "",
              path: data.path ?? "",
              method: data.method,
              body: data.body,
            },
            { projectId, installationId, sessionId },
          );

          if (response.body && response.status != null) {
            onProxiedApiResponse?.(response.status, response.body, path);
          }

          iframeRef.current?.contentWindow?.postMessage(response, "*");
        })();
        return;
      }

      if (data?.type !== PREVIEW_MESSAGE_TYPE) return;
      if (event.source !== iframeRef.current?.contentWindow) return;

      if (data.status === "path" && data.path) {
        setPreviewPath(data.path);
        return;
      }

      if (data.status === "ready" || data.status === "error") {
        setReadyIframeKey(iframeKey);
        postNavigate(previewPathRef.current);
      }
    }

    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [
    postNavigate,
    installationId,
    projectId,
    sessionId,
    onProxiedApiResponse,
    iframeKey,
  ]);

  function handlePathChange(path: string) {
    setPreviewPath(path);
    postNavigate(path);
  }

  function handleRefresh() {
    setRefreshKey((key) => key + 1);
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <ArtifactPreviewNavBar
        path={previewPath}
        routes={routes}
        onPathChange={handlePathChange}
        onRefresh={handleRefresh}
        refreshing={loading}
      />
      <div className="relative min-h-0 flex-1">
        {loading ? <PreviewLoadingOverlay /> : null}
        <iframe
          ref={iframeRef}
          key={iframeKey}
          title="App preview"
          sandbox="allow-scripts"
          srcDoc={srcdoc}
          className={`h-full w-full border-0 bg-[var(--hero-bg)] transition-opacity duration-300 ${
            loading ? "opacity-0" : "opacity-100"
          }`}
        />
      </div>
    </div>
  );
}
