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
  const executeFailed = toolCalls.some(
    (call) =>
      call.name === "execute_transaction" &&
      typeof call.result === "object" &&
      call.result !== null &&
      "error" in call.result,
  );

  for (const call of toolCalls) {
    if (call.name === "query_chain") {
      const result = call.result as {
        error?: { code?: string; message?: string };
        balance_display?: number;
        native_symbol?: string;
        provisioned?: boolean;
        balances?: Array<{ coin_key: string; balance_display: number }>;
        input_coin?: string;
        output_coin?: string;
        input_amount_display?: number;
        output_amount_display?: number;
        pool_key?: string;
        orders?: Array<{
          order_id: string;
          price: number;
          remaining_quantity: number;
          is_bid: boolean;
        }>;
      };

      if (result.error?.message) {
        receipts.push({
          label: "Query failed",
          detail: result.error.code?.replace(/_/g, " ").toLowerCase(),
        });
        continue;
      }

      if (
        !executeFailed &&
        result.input_coin &&
        result.output_coin &&
        result.input_amount_display != null &&
        result.output_amount_display != null
      ) {
        receipts.push({
          label: "Swap quote",
          detail: `${result.input_amount_display} ${result.input_coin} → ~${result.output_amount_display} ${result.output_coin}${result.pool_key ? ` (${result.pool_key})` : ""}`,
        });
      }

      if (Array.isArray(result.orders) && result.pool_key) {
        const count = result.orders.length;
        receipts.push({
          label: count === 0 ? "No open orders" : "Open orders",
          detail:
            count === 0
              ? result.pool_key
              : `${count} on ${result.pool_key}`,
        });
      }

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
      const raw = call.result as {
        error?: { code?: string; message?: string };
        status?: string;
        result?: {
          digest?: string;
          deepbook?: {
            manager_object_id?: string;
            already_provisioned?: boolean;
            coin_key?: string;
            amount_display?: number;
            swap?: {
              input_coin?: string;
              output_coin?: string;
              in_amount_display?: number;
              out_amount_display?: number;
              pool_key?: string;
            };
            order?: {
              pool_key?: string;
              action?: string;
              order_id?: string;
              price?: number;
              quantity?: number;
              is_bid?: boolean;
              cancelled_count?: number;
            };
          };
        };
        pending?: { action?: string; amount_display?: string };
      };

      if (raw.error?.message) {
        continue;
      }

      const outcome = raw;

      if (outcome.status === "approval_required" && outcome.pending) {
        const action = outcome.pending.action ?? "";
        if (action === "deepbook_provision_manager") {
          receipts.push({
            label: "Setup approval required",
            detail: outcome.pending.amount_display,
          });
        } else if (action === "deepbook_deposit" || action === "deepbook_withdraw") {
          const verb = action === "deepbook_deposit" ? "Deposit" : "Withdraw";
          receipts.push({
            label: `${verb} approval required`,
            detail: outcome.pending.amount_display,
          });
        } else if (action === "swap" || action === "deepbook_swap") {
          receipts.push({
            label: "Swap approval required",
            detail: outcome.pending.amount_display,
          });
        } else if (
          action === "deepbook_place_limit_order" ||
          action === "deepbook_place_market_order"
        ) {
          receipts.push({
            label: "Order approval required",
            detail: outcome.pending.amount_display,
          });
        } else if (
          action === "deepbook_cancel_order" ||
          action === "deepbook_cancel_all_orders"
        ) {
          receipts.push({
            label: "Cancel approval required",
            detail: outcome.pending.amount_display,
          });
        }
      }

      if (outcome.status === "executed" && outcome.result?.digest) {
        const digest = outcome.result.digest;
        const swap = outcome.result.deepbook?.swap;
        const order = outcome.result.deepbook?.order;
        const coinKey = outcome.result.deepbook?.coin_key;
        const amount = outcome.result.deepbook?.amount_display;
        const managerObjectId = outcome.result.deepbook?.manager_object_id;
        const alreadyProvisioned = outcome.result.deepbook?.already_provisioned === true;
        const isSwap = swap?.input_coin && swap.output_coin;
        const isOrder = order?.action?.includes("place");
        const isCancel = order?.action?.includes("cancel");
        const isDeepBookTransfer =
          coinKey !== undefined && amount !== undefined && amount !== null;
        const isProvision = managerObjectId !== undefined && !isSwap && !isDeepBookTransfer && !isOrder && !isCancel;

        receipts.push({
          label: isSwap
            ? "Swap executed"
            : isOrder
              ? "Order placed"
              : isCancel
                ? "Order cancelled"
                : isProvision
                  ? alreadyProvisioned
                    ? "Balance manager ready"
                    : "Balance manager created"
                  : isDeepBookTransfer
                    ? "DeepBook transfer"
                    : "Transaction sent",
          detail: isSwap
            ? `${swap.in_amount_display} ${swap.input_coin} → ${swap.out_amount_display} ${swap.output_coin} · ${digest.length > 12 ? `${digest.slice(0, 10)}…` : digest}`
            : isOrder && order
              ? `${order.is_bid ? "buy" : "sell"} ${order.quantity ?? ""}${order.price != null ? ` @ ${order.price}` : ""} · ${digest.length > 12 ? `${digest.slice(0, 10)}…` : digest}`
              : isCancel && order
                ? `${order.cancelled_count ?? 1} order(s) · ${digest.length > 12 ? `${digest.slice(0, 10)}…` : digest}`
                : isProvision
                  ? managerObjectId.length > 12
                    ? `${managerObjectId.slice(0, 10)}…`
                    : managerObjectId
                  : isDeepBookTransfer
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
