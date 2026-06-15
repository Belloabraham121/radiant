import type { PendingTransaction } from "@/lib/chat-api";
import {
  PREVIEW_EXECUTE_RESULT,
  type PreviewExecuteResultMessage,
} from "@/lib/artifact-preview-bridge";

export type PreviewExecuteResultListener = (message: PreviewExecuteResultMessage) => void;

let executeResultListener: PreviewExecuteResultListener | null = null;

export function subscribePreviewExecuteResult(
  listener: PreviewExecuteResultListener,
): () => void {
  executeResultListener = listener;
  return () => {
    if (executeResultListener === listener) {
      executeResultListener = null;
    }
  };
}

export function handlePreviewExecuteResultMessage(data: unknown): boolean {
  if (
    !data ||
    typeof data !== "object" ||
    (data as { type?: string }).type !== PREVIEW_EXECUTE_RESULT
  ) {
    return false;
  }

  executeResultListener?.(data as PreviewExecuteResultMessage);
  return true;
}

export function previewExecuteResultToPending(
  message: PreviewExecuteResultMessage,
): PendingTransaction | null {
  if (message.status !== "approval_required" || !message.pending) {
    return null;
  }
  const pending = message.pending;
  const id = typeof pending.id === "string" ? pending.id : null;
  if (!id) return null;
  return {
    id,
    chain_id: (typeof pending.chain_id === "string" ? pending.chain_id : "sui") as PendingTransaction["chain_id"],
    action: typeof pending.action === "string" ? pending.action : message.action,
    params: (pending.params as Record<string, unknown>) ?? {},
    summary: typeof pending.summary === "string" ? pending.summary : "Confirm transaction",
    amount_display: typeof pending.amount_display === "string" ? pending.amount_display : "",
  };
}
