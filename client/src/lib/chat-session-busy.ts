import type { PendingClarification, PendingTransaction } from "@/lib/chat-api";
import type { ChatMessage } from "@/lib/chat-messages";

function isSwapBridgeClarification(
  pending: PendingClarification | null | undefined,
): boolean {
  if (!pending) {
    return false;
  }
  return pending.gap_id.startsWith("swap.") || pending.gap_id.startsWith("bridge.");
}

function messagesHaveRunningExecutionSteps(messages: ChatMessage[]): boolean {
  return messages.some((message) =>
    message.executionSteps?.some((step) => step.status === "running"),
  );
}

export function isChatSessionBusy(input: {
  pendingTx: PendingTransaction | null;
  approving: boolean;
  streaming: boolean;
  pendingClarification: PendingClarification | null;
  messages: ChatMessage[];
}): boolean {
  if (input.pendingTx !== null || input.approving) {
    return true;
  }

  if (isSwapBridgeClarification(input.pendingClarification)) {
    return true;
  }

  const hasRunningSteps = messagesHaveRunningExecutionSteps(input.messages);
  if (hasRunningSteps) {
    return true;
  }

  return input.streaming && hasRunningSteps;
}
