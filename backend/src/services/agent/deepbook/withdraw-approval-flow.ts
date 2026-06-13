import type { AgentToolErrorResult } from "./tools.js";
import type { ExecuteToolOutcome, ToolCallRecord } from "./agent.types.js";
import { EXECUTE_TRANSACTION_TOOL_NAME } from "./execute-transaction.tool.js";
import { QUERY_CHAIN_TOOL_NAME } from "./query-chain.tool.js";

export type DeepBookWithdrawIntent = {
  coin_key: string;
  withdraw_all: boolean;
  amount_display?: number;
};

const COIN_PATTERN = "sui|usdc|deep|wal|usdt";

export function extractWithdrawIntent(message: string): DeepBookWithdrawIntent | null {
  const withdrawAllPatterns = [
    new RegExp(`\\bwithdraw\\s+all\\s+(?:my\\s+)?(?:of\\s+)?(${COIN_PATTERN})\\b`, "i"),
    new RegExp(
      `\\bwithdraw\\s+all\\s+(?:my\\s+)?(${COIN_PATTERN})\\s+from\\s+(?:my\\s+)?(?:deepbook|balance manager)`,
      "i",
    ),
  ];

  for (const pattern of withdrawAllPatterns) {
    const match = message.match(pattern);
    if (match) {
      return { coin_key: match[1].toUpperCase(), withdraw_all: true };
    }
  }

  const amountMatch = message.match(
    new RegExp(`\\bwithdraw\\s+([\\d.,]+)\\s*(${COIN_PATTERN})\\b`, "i"),
  );
  if (amountMatch) {
    const amount = Number(amountMatch[1].replace(/,/g, ""));
    if (Number.isFinite(amount) && amount > 0) {
      return {
        coin_key: amountMatch[2].toUpperCase(),
        withdraw_all: false,
        amount_display: amount,
      };
    }
  }

  const genericWithdraw = message.match(
    new RegExp(`\\bwithdraw\\s+(?:my\\s+)?(${COIN_PATTERN})\\s+from`, "i"),
  );
  if (genericWithdraw && /\bwithdraw\b/i.test(message)) {
    return { coin_key: genericWithdraw[1].toUpperCase(), withdraw_all: true };
  }

  return null;
}

function isManagerBalanceQuery(result: unknown, coinKey: string): boolean {
  if (typeof result !== "object" || result === null || "error" in result) {
    return false;
  }

  const balances = (result as { balances?: Array<{ coin_key: string; balance_display: number }> })
    .balances;
  return Array.isArray(balances) && balances.some((entry) => entry.coin_key === coinKey);
}

function isWithdrawExecuteOutcome(result: unknown): boolean {
  if (typeof result !== "object" || result === null || "error" in result) {
    return false;
  }

  const outcome = result as ExecuteToolOutcome;
  if (outcome.status === "approval_required") {
    return outcome.pending?.action === "deepbook_withdraw";
  }

  return outcome.status === "executed";
}

export function hasManagerBalanceQuery(
  toolCalls: ToolCallRecord[],
  coinKey: string,
): boolean {
  return toolCalls.some(
    (call) =>
      call.name === QUERY_CHAIN_TOOL_NAME && isManagerBalanceQuery(call.result, coinKey),
  );
}

export function shouldNudgeWithdrawBalanceQuery(
  toolCalls: ToolCallRecord[],
  lastUserMessage: string,
): boolean {
  const intent = extractWithdrawIntent(lastUserMessage);
  if (!intent) {
    return false;
  }

  return !hasManagerBalanceQuery(toolCalls, intent.coin_key);
}

export function shouldNudgeWithdrawExecute(
  toolCalls: ToolCallRecord[],
  lastUserMessage: string,
): boolean {
  const intent = extractWithdrawIntent(lastUserMessage);
  if (!intent) {
    return false;
  }

  if (!hasManagerBalanceQuery(toolCalls, intent.coin_key)) {
    return false;
  }

  return !toolCalls.some(
    (call) =>
      call.name === EXECUTE_TRANSACTION_TOOL_NAME && isWithdrawExecuteOutcome(call.result),
  );
}

export function buildWithdrawBalanceNudge(coinKey: string): string {
  return (
    `Query the DeepBook manager balance first: query_chain deepbook_manager_balance ` +
    `with chain_id sui and params { coin_key: "${coinKey}" }. Then withdraw in the same turn.`
  );
}

export function buildWithdrawExecuteNudge(intent: DeepBookWithdrawIntent): string {
  if (intent.withdraw_all) {
    return (
      `Call execute_transaction now: chain_id sui, action deepbook_withdraw, ` +
      `params { coin_key: "${intent.coin_key}", withdraw_all: true }. ` +
      "Use withdraw_all — not amount 0. The app shows an approval bar."
    );
  }

  return (
    `Call execute_transaction now: chain_id sui, action deepbook_withdraw, ` +
    `params { coin_key: "${intent.coin_key}", amount_display: ${intent.amount_display} }. ` +
    "The app shows an approval bar."
  );
}

export function isWithdrawValidationError(result: unknown): result is AgentToolErrorResult {
  return (
    typeof result === "object" &&
    result !== null &&
    "error" in result &&
    (result as AgentToolErrorResult).error?.code === "VALIDATION_ERROR"
  );
}
