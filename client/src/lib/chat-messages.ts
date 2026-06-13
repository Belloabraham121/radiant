import type { ApiChatMessage, ChatToolCall } from "@/lib/chat-api";
import type { AgentChainId } from "@/lib/agent-chains";
import { chainExplorerTxUrl } from "@/lib/chain-meta";

export type Receipt = {
  label: string;
  detail?: string;
  agentTransactionId?: string;
  digest?: string;
  chainId?: AgentChainId;
  sessionId?: string;
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
        active_stake?: number;
        inactive_stake?: number;
        total_stake?: number;
        stake_required?: number;
        quorum?: number;
        current_epoch?: {
          taker_fee?: number;
          maker_fee?: number;
          stake_required?: number;
        };
        account?: {
          active_stake?: number;
          voted_proposal?: string | null;
        };
        quote_volume_24h?: number;
        trades?: Array<{ trade_id: string }>;
        count?: number;
        candles?: Array<{ timestamp_ms: number }>;
        interval?: string;
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

      if (result.total_stake != null && result.pool_key) {
        receipts.push({
          label: "DEEP stake",
          detail: `${result.active_stake ?? 0} active + ${result.inactive_stake ?? 0} inactive on ${result.pool_key}`,
        });
      }

      if (result.stake_required != null && result.pool_key) {
        receipts.push({
          label: "Stake tier",
          detail: `${result.stake_required} DEEP required on ${result.pool_key}`,
        });
      }

      if (result.quorum != null && result.pool_key) {
        receipts.push({
          label: "Governance",
          detail: `Quorum ${result.quorum} DEEP on ${result.pool_key}`,
        });
      }

      if (result.quote_volume_24h != null && result.pool_key) {
        receipts.push({
          label: "24h volume",
          detail: `${result.quote_volume_24h} quote on ${result.pool_key}`,
        });
      }

      if (Array.isArray(result.trades) && result.pool_key) {
        receipts.push({
          label: "Recent trades",
          detail: `${result.count ?? result.trades.length} on ${result.pool_key}`,
        });
      }

      if (Array.isArray(result.candles) && result.pool_key) {
        receipts.push({
          label: "OHLCV",
          detail: `${result.candles.length} candles (${result.interval ?? "?"}) on ${result.pool_key}`,
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
        agent_transaction_id?: string;
        result?: {
          chain_id?: AgentChainId;
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
            stake?: {
              pool_key?: string;
              action?: string;
              amount_display?: number | null;
            };
            governance?: {
              pool_key?: string;
              action?: string;
              proposal_id?: string | null;
              taker_fee?: number | null;
              maker_fee?: number | null;
              stake_required?: number | null;
            };
          };
        };
        pending?: { id?: string; chain_id?: AgentChainId; action?: string; amount_display?: string };
      };

      if (raw.error?.message) {
        continue;
      }

      const outcome = raw;
      const agentTransactionId =
        outcome.agent_transaction_id ?? outcome.pending?.id;
      const chainId =
        outcome.result?.chain_id ?? outcome.pending?.chain_id;

      const receiptMeta = {
        ...(agentTransactionId ? { agentTransactionId } : {}),
        ...(chainId ? { chainId } : {}),
      };

      if (outcome.status === "approval_required" && outcome.pending) {
        const action = outcome.pending.action ?? "";
        if (action === "deepbook_provision_manager") {
          receipts.push({
            label: "Setup approval required",
            detail: outcome.pending.amount_display,
            ...receiptMeta,
          });
        } else if (action === "deepbook_deposit" || action === "deepbook_withdraw") {
          const verb = action === "deepbook_deposit" ? "Deposit" : "Withdraw";
          receipts.push({
            label: `${verb} approval required`,
            detail: outcome.pending.amount_display,
            ...receiptMeta,
          });
        } else if (action === "swap" || action === "deepbook_swap") {
          receipts.push({
            label: "Swap approval required",
            detail: outcome.pending.amount_display,
            ...receiptMeta,
          });
        } else if (
          action === "deepbook_place_limit_order" ||
          action === "deepbook_place_market_order"
        ) {
          receipts.push({
            label: "Order approval required",
            detail: outcome.pending.amount_display,
            ...receiptMeta,
          });
        } else if (
          action === "deepbook_cancel_order" ||
          action === "deepbook_cancel_orders" ||
          action === "deepbook_cancel_all_orders"
        ) {
          receipts.push({
            label: "Cancel approval required",
            detail: outcome.pending.amount_display,
            ...receiptMeta,
          });
        } else if (action === "deepbook_modify_order") {
          receipts.push({
            label: "Modify approval required",
            detail: outcome.pending.amount_display,
            ...receiptMeta,
          });
        } else if (
          action === "deepbook_withdraw_settled_amounts" ||
          action === "deepbook_withdraw_settled_amounts_permissionless"
        ) {
          receipts.push({
            label: "Claim proceeds approval required",
            detail: outcome.pending.amount_display,
            ...receiptMeta,
          });
        } else if (action === "deepbook_stake" || action === "deepbook_unstake") {
          receipts.push({
            label: action === "deepbook_stake" ? "Stake approval required" : "Unstake approval required",
            detail: outcome.pending.amount_display,
            ...receiptMeta,
          });
        } else if (action === "deepbook_submit_proposal" || action === "deepbook_vote") {
          receipts.push({
            label: action === "deepbook_submit_proposal" ? "Proposal approval required" : "Vote approval required",
            detail: outcome.pending.amount_display,
            ...receiptMeta,
          });
        }
      }

      if (outcome.status === "executed" && outcome.result?.digest) {
        const digest = outcome.result.digest;
        const swap = outcome.result.deepbook?.swap;
        const order = outcome.result.deepbook?.order;
        const stake = outcome.result.deepbook?.stake;
        const governance = outcome.result.deepbook?.governance;
        const coinKey = outcome.result.deepbook?.coin_key;
        const amount = outcome.result.deepbook?.amount_display;
        const managerObjectId = outcome.result.deepbook?.manager_object_id;
        const alreadyProvisioned = outcome.result.deepbook?.already_provisioned === true;
        const isSwap = swap?.input_coin && swap.output_coin;
        const isOrder = order?.action?.includes("place");
        const isCancel = order?.action?.includes("cancel");
        const isModify = order?.action?.includes("modify");
        const isSettledWithdraw = order?.action?.includes("withdraw_settled");
        const isStake = stake?.action === "deepbook_stake";
        const isUnstake = stake?.action === "deepbook_unstake";
        const isSubmitProposal = governance?.action === "deepbook_submit_proposal";
        const isVote = governance?.action === "deepbook_vote";
        const isDeepBookTransfer =
          coinKey !== undefined && amount !== undefined && amount !== null;
        const isProvision = managerObjectId !== undefined && !isSwap && !isDeepBookTransfer && !isOrder && !isCancel;

        receipts.push({
          label: isSwap
            ? "Swap executed"
            : isStake
              ? "DEEP staked"
              : isUnstake
                ? "DEEP unstaked"
              : isSubmitProposal
                ? "Proposal submitted"
                : isVote
                  ? "Vote cast"
            : isOrder
              ? "Order placed"
              : isCancel
                ? "Order cancelled"
                : isModify
                  ? "Order modified"
                  : isSettledWithdraw
                    ? "Settled proceeds claimed"
                    : isProvision
                  ? alreadyProvisioned
                    ? "Balance manager ready"
                    : "Balance manager created"
                  : isDeepBookTransfer
                    ? "DeepBook transfer"
                    : "Transaction sent",
          detail: isSwap
            ? `${swap.in_amount_display} ${swap.input_coin} → ${swap.out_amount_display} ${swap.output_coin} · ${digest.length > 12 ? `${digest.slice(0, 10)}…` : digest}`
            : isStake && stake
              ? `${stake.amount_display ?? "?"} DEEP on ${stake.pool_key ?? "?"} · ${digest.length > 12 ? `${digest.slice(0, 10)}…` : digest}`
              : isUnstake && stake
                ? `${stake.pool_key ?? "?"} · ${digest.length > 12 ? `${digest.slice(0, 10)}…` : digest}`
              : isSubmitProposal && governance
                ? `${governance.pool_key ?? "?"} · fees/stake proposed · ${digest.length > 12 ? `${digest.slice(0, 10)}…` : digest}`
                : isVote && governance
                  ? `${governance.proposal_id?.slice(0, 12) ?? "?"}… on ${governance.pool_key ?? "?"} · ${digest.length > 12 ? `${digest.slice(0, 10)}…` : digest}`
            : isOrder && order
              ? `${order.is_bid ? "buy" : "sell"} ${order.quantity ?? ""}${order.price != null ? ` @ ${order.price}` : ""} · ${digest.length > 12 ? `${digest.slice(0, 10)}…` : digest}`
              : isCancel && order
                ? `${order.cancelled_count ?? 1} order(s) · ${digest.length > 12 ? `${digest.slice(0, 10)}…` : digest}`
                : isModify && order
                  ? `qty ${order.quantity ?? ""} · ${digest.length > 12 ? `${digest.slice(0, 10)}…` : digest}`
                  : isSettledWithdraw
                    ? digest.length > 12
                      ? `${digest.slice(0, 10)}…`
                      : digest
                    : isProvision
                  ? managerObjectId.length > 12
                    ? `${managerObjectId.slice(0, 10)}…`
                    : managerObjectId
                  : isDeepBookTransfer
                    ? `${amount} ${coinKey} · ${digest.length > 12 ? `${digest.slice(0, 10)}…` : digest}`
                    : digest.length > 12
                      ? `${digest.slice(0, 10)}…`
                      : digest,
          ...receiptMeta,
          digest,
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
