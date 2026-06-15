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

/** Keeps agent SSE connected for the chat session and forwards events into the open preview iframe. */
export function ChatAgentStreamProvider({
  sessionId,
  children,
}: {
  sessionId: string | undefined;
  children: ReactNode;
}) {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  const forwardToPreview = useCallback((event: PreviewEvent) => {
    postAgentEventToPreviewIframe(iframeRef.current, event);
  }, []);

  const registerPreviewIframe = useCallback(
    (iframe: HTMLIFrameElement | null) => {
      iframeRef.current = iframe;
      registerPreviewApprovalRelay(iframe, sessionId);
    },
    [sessionId],
  );

  useAgentStream(sessionId, forwardToPreview, Boolean(sessionId));

  return (
    <ChatAgentStreamContext.Provider
      value={{ registerPreviewIframe, forwardToPreview }}
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
