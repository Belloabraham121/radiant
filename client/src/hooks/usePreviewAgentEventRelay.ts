"use client";

import { useEffect, type RefObject } from "react";
import { postAgentEventToPreviewIframe } from "@/lib/artifact-preview-bridge";

/**
 * Placeholder hook for Phase 8 SSE — forwards agent stream events into the preview iframe.
 * Subscribe to your SSE source and call `forward(event)` from the callback.
 */
export function usePreviewAgentEventRelay(
  iframeRef: RefObject<HTMLIFrameElement | null>,
  enabled = true,
): {
  forward: (event: Parameters<typeof postAgentEventToPreviewIframe>[1]) => void;
} {
  useEffect(() => {
    if (!enabled) return;
    // Phase 8: EventSource → postAgentEventToPreviewIframe(iframeRef.current, payload)
    return undefined;
  }, [enabled, iframeRef]);

  return {
    forward: (event) => postAgentEventToPreviewIframe(iframeRef.current, event),
  };
}
