import { getDefaultAgentChainId } from "../../config/chains.js";
import type { PendingTransaction, ToolCallRecord } from "./agent.types.js";
import { EXECUTE_TRANSACTION_TOOL_NAME } from "./execute-transaction.tool.js";
import { QUERY_CHAIN_TOOL_NAME } from "./query-chain.tool.js";
import { runAgentTool } from "./tools.js";
import { getAgentPermissions, approvalThresholdLabel } from "./agent-permissions.service.js";
import type { ExecuteToolOutcome } from "./agent.types.js";
import { isExecutePendingUserAction, pendingTransactionFromExecuteOutcome } from "./agent.types.js";
import type { BalanceResult } from "../chains/types.js";

function defaultChainId() {
  return getDefaultAgentChainId();
}

function parseTransferIntent(message: string): {
  amount: string;
  recipient: string;
} | null {
  const match = message.match(
    /(?:send|pay|transfer)\s+(\d+(?:\.\d+)?)\s+(?:sui|eth|sol)?\s*(?:to\s+)?(0x[a-fA-F0-9]{40,64})/i,
  );
  if (!match) return null;

  const amountDisplay = match[1];
  const recipient = match[2];
  const chainId = defaultChainId();

  let amountAtomic: string;
  if (chainId === "ethereum") {
    amountAtomic = BigInt(Math.floor(Number(amountDisplay) * 1e18)).toString();
  } else {
    amountAtomic = BigInt(Math.floor(Number(amountDisplay) * 1_000_000_000)).toString();
  }

  return { amount: amountAtomic, recipient };
}

function isBalanceIntent(message: string): boolean {
  return /\b(balance|how much)\b/i.test(message);
}

function formatBalanceReply(balance: BalanceResult): string {
  return `Your ${balance.native_symbol} agent wallet (${balance.address.slice(0, 10)}…) holds ${balance.balance_display.toFixed(4)} ${balance.native_symbol}.`;
}

async function formatExecuteReply(
  privyUserId: string,
  outcome: ExecuteToolOutcome,
): Promise<string> {
  if (isExecutePendingUserAction(outcome)) {
    if (outcome.status === "liquidity_fallback_offered") {
      return "Li-Fi has no route for this transfer. An alternate liquidity route is available — review it in the dialog.";
    }
    const permissions = await getAgentPermissions(privyUserId);
    if (!permissions.auto_approve_enabled) {
      return "This transaction needs your approval. Review the details and approve to continue.";
    }
    return (
      `That transfer is above your auto-approve limit (${approvalThresholdLabel(outcome.pending.chain_id, permissions)}). ` +
      "Review the details and approve to continue."
    );
  }

  if (outcome.status !== "executed") {
    return "Transaction outcome is pending.";
  }

  return `Transaction submitted on ${outcome.result.chain_id}. Digest: ${outcome.result.digest}`;
}

export type StubAgentResult = {
  reply: string;
  tool_calls: ToolCallRecord[];
  pending_transaction: PendingTransaction | null;
};

export async function runStubAgent(
  privyUserId: string,
  message: string,
  _sessionId?: string,
): Promise<StubAgentResult> {
  const chainId = defaultChainId();
  const tool_calls: ToolCallRecord[] = [];
  let pending_transaction: PendingTransaction | null = null;
  let reply: string;

  if (isBalanceIntent(message)) {
    const balance = (await runAgentTool(privyUserId, QUERY_CHAIN_TOOL_NAME, {
      chain_id: chainId,
      query: "balance",
    })) as BalanceResult;
    tool_calls.push({ name: QUERY_CHAIN_TOOL_NAME, result: balance });
    reply = formatBalanceReply(balance);
  } else {
    const transfer = parseTransferIntent(message);
    if (transfer) {
      const outcome = (await runAgentTool(
        privyUserId,
        EXECUTE_TRANSACTION_TOOL_NAME,
        {
          chain_id: chainId,
          action: "transfer_native",
          params: {
            recipient: transfer.recipient,
            amount_atomic: transfer.amount,
          },
        },
        { sessionId: _sessionId },
      )) as ExecuteToolOutcome;

      tool_calls.push({ name: EXECUTE_TRANSACTION_TOOL_NAME, result: outcome });
      if (isExecutePendingUserAction(outcome)) {
        pending_transaction = pendingTransactionFromExecuteOutcome(outcome) ?? null;
      }
      reply = await formatExecuteReply(privyUserId, outcome);
    } else {
      reply =
        "I can check your agent wallet balance or prepare transfers on your enabled chains. " +
        'Try "What\'s my balance?" or "Send 1 SUI to 0x…".';
    }
  }

  return {
    reply,
    tool_calls,
    pending_transaction,
  };
}
