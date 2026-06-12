import type { ApiChatMessage, ChatToolCall } from "@/lib/chat-api";

export type Receipt = {
  label: string;
  detail?: string;
};

export type ChatMessage = {
  id: string;
  role: "user" | "agent";
  text: string;
  receipts?: Receipt[];
  error?: boolean;
};

export function formatSessionTime(updatedAt: string): string {
  const date = new Date(updatedAt);
  const diffMs = Date.now() - date.getTime();
  const diffMins = Math.floor(diffMs / 60_000);

  if (diffMins < 1) return "now";
  if (diffMins < 60) return `${diffMins}m`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d`;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function mapToolCallsToReceipts(toolCalls: ChatToolCall[]): Receipt[] {
  const receipts: Receipt[] = [];

  for (const call of toolCalls) {
    if (call.name === "query_chain") {
      const result = call.result as {
        balance_display?: number;
        native_symbol?: string;
        provisioned?: boolean;
        balances?: Array<{ coin_key: string; balance_display: number }>;
      };

      if (result.balance_display != null) {
        receipts.push({
          label: "Balance checked",
          detail: `${result.balance_display.toFixed(4)} ${result.native_symbol ?? ""}`.trim(),
        });
      }

      if (result.provisioned === false) {
        receipts.push({
          label: "DeepBook manager",
          detail: "Not provisioned yet",
        });
      } else if (result.balances && result.balances.length > 0) {
        const top = result.balances
          .filter((b) => b.balance_display > 0)
          .slice(0, 2)
          .map((b) => `${b.balance_display} ${b.coin_key}`)
          .join(", ");
        if (top) {
          receipts.push({ label: "DeepBook balances", detail: top });
        }
      }
    }

    if (call.name === "execute_transaction") {
      const outcome = call.result as {
        status?: string;
        result?: {
          digest?: string;
          deepbook?: { coin_key?: string; amount_display?: number };
        };
        pending?: { action?: string; amount_display?: string };
      };

      if (outcome.status === "approval_required" && outcome.pending) {
        const action = outcome.pending.action ?? "";
        if (action === "deepbook_deposit" || action === "deepbook_withdraw") {
          const verb = action === "deepbook_deposit" ? "Deposit" : "Withdraw";
          receipts.push({
            label: `${verb} approval required`,
            detail: outcome.pending.amount_display,
          });
        }
      }

      if (outcome.status === "executed" && outcome.result?.digest) {
        const digest = outcome.result.digest;
        const coinKey = outcome.result.deepbook?.coin_key;
        const amount = outcome.result.deepbook?.amount_display;
        const isDeepBook =
          coinKey !== undefined && amount !== undefined && amount !== null;

        receipts.push({
          label: isDeepBook ? "DeepBook transfer" : "Transaction sent",
          detail: isDeepBook
            ? `${amount} ${coinKey} · ${digest.length > 12 ? `${digest.slice(0, 10)}…` : digest}`
            : digest.length > 12
              ? `${digest.slice(0, 10)}…`
              : digest,
        });
      }
    }
  }

  return receipts;
}

function parseToolCalls(raw: unknown): ChatToolCall[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (item): item is ChatToolCall =>
      typeof item === "object" &&
      item !== null &&
      "name" in item &&
      typeof (item as ChatToolCall).name === "string",
  );
}

export function apiMessageToChatMessage(message: ApiChatMessage): ChatMessage | null {
  if (message.role === "user") {
    return { id: message.id, role: "user", text: message.content };
  }

  if (message.role === "assistant") {
    return {
      id: message.id,
      role: "agent",
      text: message.content,
      receipts: mapToolCallsToReceipts(parseToolCalls(message.tool_calls)),
    };
  }

  return null;
}

export function apiMessagesToChatMessages(messages: ApiChatMessage[]): ChatMessage[] {
  return messages
    .map(apiMessageToChatMessage)
    .filter((message): message is ChatMessage => message !== null);
}
