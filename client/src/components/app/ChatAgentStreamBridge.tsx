"use client";

import {
  createContext,
  useCallback,
  useContext,
  useRef,
  type ReactNode,
} from "react";
import { useAgentStream } from "@/hooks/useAgentStream";
import {
  postAgentEventToPreviewIframe,
  type RadiantAgentStreamEvent,
} from "@/lib/artifact-preview-bridge";
import { registerPreviewApprovalRelay } from "@/lib/preview-approval-relay";

type PreviewEvent = Omit<RadiantAgentStreamEvent, "type">;

type ChatAgentStreamContextValue = {
  registerPreviewIframe: (iframe: HTMLIFrameElement | null) => void;
  forwardToPreview: (event: PreviewEvent) => void;
};

const ChatAgentStreamContext = createContext<ChatAgentStreamContextValue | null>(
  null,
);

const PREVIEW_EVENT_BUFFER_MAX = 48;

/** Keeps agent SSE connected for the chat session and forwards events into the open preview iframe. */
export function ChatAgentStreamProvider({
  sessionId,
  children,
}: {
  sessionId: string | undefined;
  children: ReactNode;
}) {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const pendingEventsRef = useRef<PreviewEvent[]>([]);

  const deliverToPreview = useCallback((event: PreviewEvent) => {
    const iframe = iframeRef.current;
    if (!iframe?.contentWindow) {
      const buffer = pendingEventsRef.current;
      buffer.push(event);
      if (buffer.length > PREVIEW_EVENT_BUFFER_MAX) {
        buffer.splice(0, buffer.length - PREVIEW_EVENT_BUFFER_MAX);
      }
      return;
    }
    postAgentEventToPreviewIframe(iframe, event);
  }, []);

  const flushPendingToPreview = useCallback(() => {
    const iframe = iframeRef.current;
    if (!iframe?.contentWindow) return;
    const pending = pendingEventsRef.current.splice(0);
    for (const event of pending) {
      postAgentEventToPreviewIframe(iframe, event);
    }
  }, []);

  const registerPreviewIframe = useCallback(
    (iframe: HTMLIFrameElement | null) => {
      iframeRef.current = iframe;
      registerPreviewApprovalRelay(iframe, sessionId);
      if (iframe) {
        flushPendingToPreview();
      }
    },
    [flushPendingToPreview, sessionId],
  );

  useAgentStream(sessionId, deliverToPreview, Boolean(sessionId));

  return (
    <ChatAgentStreamContext.Provider
      value={{ registerPreviewIframe, forwardToPreview: deliverToPreview }}
    >
      {children}
    </ChatAgentStreamContext.Provider>
  );
}

export function useChatAgentStream(): ChatAgentStreamContextValue {
  const context = useContext(ChatAgentStreamContext);
  if (!context) {
    throw new Error(
      "useChatAgentStream must be used within ChatAgentStreamProvider",
    );
  }
  return context;
}
