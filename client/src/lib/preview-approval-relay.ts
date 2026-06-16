import type { PendingTransaction } from "@/lib/chat-api";
import {
  PREVIEW_TX_APPROVAL_REQUEST,
  PREVIEW_TX_APPROVAL_RESOLVED,
  type PreviewTxApprovalResolvedMessage,
} from "@/lib/artifact-preview-bridge";
import { getActivePreviewSession } from "@/lib/active-preview-session";

type ApprovalResolutionListener = (message: PreviewTxApprovalResolvedMessage) => void;

let relayIframe: HTMLIFrameElement | null = null;
let relaySessionId: string | undefined;
let resolutionListener: ApprovalResolutionListener | null = null;
let queuedPendingApproval: {
  pending: PendingTransaction;
  sessionId: string;
  action?: string;
} | null = null;

function postApprovalRequestToIframe(
  pending: PendingTransaction,
  action?: string,
): void {
  relayIframe?.contentWindow?.postMessage(
    {
      type: PREVIEW_TX_APPROVAL_REQUEST,
      action: action ?? pending.action,
      pending,
    },
    "*",
  );
}

/** Register the open artifact iframe for chat→preview approval relay. */
export function registerPreviewApprovalRelay(
  iframe: HTMLIFrameElement | null,
  sessionId?: string,
): void {
  relayIframe = iframe;
  relaySessionId = sessionId;

  if (
    iframe?.contentWindow &&
    queuedPendingApproval &&
    (!sessionId || queuedPendingApproval.sessionId === sessionId)
  ) {
    postApprovalRequestToIframe(queuedPendingApproval.pending, queuedPendingApproval.action);
    queuedPendingApproval = null;
  }
}

export function subscribePreviewApprovalResolution(
  listener: ApprovalResolutionListener,
): () => void {
  resolutionListener = listener;
  return () => {
    if (resolutionListener === listener) {
      resolutionListener = null;
    }
  };
}

/**
 * Actions that the preview iframe can handle (swap UI with confirm button).
 * Wallet-only actions (margin, predict, stake, governance, etc.) should
 * always use the chat-level approval bar — never relay to the preview.
 */
const PREVIEW_RELAYABLE_ACTIONS = new Set([
  "swap",
  "deepbook_swap",
  "deepbook_deposit",
  "deepbook_withdraw",
  "deepbook_provision_manager",
]);

function isPreviewRelayableAction(action: string): boolean {
  return PREVIEW_RELAYABLE_ACTIONS.has(action);
}

/** Forward a chat pending transaction into the artifact iframe for in-app approval. */
export function tryRelayPendingApprovalToPreview(
  pending: PendingTransaction,
  sessionId: string | undefined,
  action?: string,
): boolean {
  if (!sessionId) {
    return false;
  }

  if (!isPreviewRelayableAction(pending.action)) {
    return false;
  }

  const active = getActivePreviewSession();
  if (!active?.sessionId || active.sessionId !== sessionId) {
    return false;
  }
  if (relaySessionId && relaySessionId !== sessionId) {
    return false;
  }

  if (relayIframe?.contentWindow) {
    postApprovalRequestToIframe(pending, action);
  } else {
    queuedPendingApproval = { pending, sessionId, action };
  }
  return true;
}

export function handlePreviewApprovalResolvedMessage(data: unknown): boolean {
  if (
    !data ||
    typeof data !== "object" ||
    (data as { type?: string }).type !== PREVIEW_TX_APPROVAL_RESOLVED
  ) {
    return false;
  }

  resolutionListener?.(data as PreviewTxApprovalResolvedMessage);
  return true;
}
