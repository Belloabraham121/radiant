import type { AgentToolErrorResult } from "../tools.js";
import type { ExecuteToolOutcome, ToolCallRecord } from "../agent.types.js";
import { EXECUTE_TRANSACTION_TOOL_NAME } from "../execute-transaction.tool.js";

export type DeepBookDepositIntent = {
  coin_key: string;
  amount_display: number;
};

const DEPOSIT_COIN_PATTERN = "sui|usdc|deep|wal|usdt";

export function extractDepositIntent(message: string): DeepBookDepositIntent | null {
  const normalized = message.replace(/^\s*eposit\b/i, "deposit");
  const patterns = [
    new RegExp(`deposit\\s+([\\d.,]+)\\s*(${DEPOSIT_COIN_PATTERN})\\b`, "i"),
    new RegExp(
      `([\\d.,]+)\\s*(${DEPOSIT_COIN_PATTERN})\\s+(?:into|to)\\s+(?:my\\s+)?(?:deepbook|balance manager)`,
      "i",
    ),
    new RegExp(`(?:want to |i want to )?deposit\\s+([\\d.,]+)\\s*(${DEPOSIT_COIN_PATTERN})\\b`, "i"),
  ];

  for (const pattern of patterns) {
    const match = normalized.match(pattern);
    if (!match) {
      continue;
    }

    const amount = Number(match[1].replace(/,/g, ""));
    if (!Number.isFinite(amount) || amount <= 0) {
      continue;
    }

    return {
      coin_key: match[2].toUpperCase(),
      amount_display: amount,
    };
  }

  return null;
}

export function userRequestedDeepBookDeposit(message: string): boolean {
  return /\bdeposit\b/i.test(message) && extractDepositIntent(message) !== null;
}

function isDepositExecuteOutcome(result: unknown): boolean {
  if (typeof result !== "object" || result === null) {
    return false;
  }

  if ("error" in result) {
    return false;
  }

  const outcome = result as ExecuteToolOutcome;
  if (outcome.status === "approval_required") {
    const action = outcome.pending?.action;
    return action === "deepbook_deposit";
  }

  return outcome.status === "executed";
}

function isDepositValidationError(result: unknown): boolean {
  return (
    typeof result === "object" &&
    result !== null &&
    "error" in result &&
    (result as AgentToolErrorResult).error?.code === "VALIDATION_ERROR"
  );
}

/** After the user names an amount, the agent must call deepbook_deposit with amount_display. */
export function shouldNudgeDepositExecute(
  toolCalls: ToolCallRecord[],
  lastUserMessage: string,
): boolean {
  const intent = extractDepositIntent(lastUserMessage);
  if (!intent) {
    return false;
  }

  let sawValidationError = false;
  for (const call of toolCalls) {
    if (call.name !== EXECUTE_TRANSACTION_TOOL_NAME) {
      continue;
    }
    if (isDepositExecuteOutcome(call.result)) {
      return false;
    }
    if (isDepositValidationError(call.result)) {
      sawValidationError = true;
    }
  }

  return sawValidationError || !toolCalls.some((call) => call.name === EXECUTE_TRANSACTION_TOOL_NAME);
}

export function buildDepositExecuteNudge(intent: DeepBookDepositIntent): string {
  return (
    `Call execute_transaction now: chain_id sui, action deepbook_deposit, ` +
    `params { coin_key: "${intent.coin_key}", amount_display: ${intent.amount_display} }. ` +
    "The app shows an approval bar — do not ask me to confirm in chat."
  );
}
