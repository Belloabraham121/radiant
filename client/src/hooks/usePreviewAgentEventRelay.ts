"use client";

import { useCallback, type RefObject } from "react";
import { postAgentEventToPreviewIframe } from "@/lib/artifact-preview-bridge";
import { useAgentStream } from "@/hooks/useAgentStream";

/** Forwards live agent SSE events into the preview iframe via postMessage. */
export function usePreviewAgentEventRelay(
  iframeRef: RefObject<HTMLIFrameElement | null>,
  sessionId: string | undefined,
  enabled = true,
): {
  forward: (event: Parameters<typeof postAgentEventToPreviewIframe>[1]) => void;
} {
  const forward = useCallback(
    (event: Parameters<typeof postAgentEventToPreviewIframe>[1]) => {
      postAgentEventToPreviewIframe(iframeRef.current, event);
    },
    [iframeRef],
  );

  useAgentStream(sessionId, forward, enabled && Boolean(sessionId));

  return { forward };
}
