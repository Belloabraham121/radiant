import type { AgentToolErrorResult } from "./tools.js";
import type { AgentTurnMessage, ExecuteToolOutcome, ToolCallRecord } from "./agent.types.js";
import { EXECUTE_TRANSACTION_TOOL_NAME } from "./execute-transaction.tool.js";
import { getDeepBookEnv } from "../../config/deepbook.js";

export type FlashLoanIntent = {
  pool_key: string;
  borrow_amount: number;
  asset: "base" | "quote";
  coin_key: string;
};

const COIN_PATTERN = "sui|usdc|deep|wal|usdt";
const AFFIRMATIVE_PATTERN = /^(yes|yeah|yep|y|confirm|confirmed|proceed|go ahead|do it|ok|okay)\b/i;

export function userRequestedFlashLoan(message: string): boolean {
  return /\bflash\s*loans?\b/i.test(message);
}

function parseAmount(raw: string): number | null {
  const normalized = raw.replace(/,/g, "").trim();
  const value = Number(normalized);
  if (!Number.isFinite(value) || value <= 0) {
    return null;
  }
  return value;
}

function resolvePoolKey(message: string): string {
  const normalized = message.toUpperCase().replace(/\//g, "_");
  const pools = Object.keys(getDeepBookEnv().pools);
  for (const poolKey of pools) {
    if (normalized.includes(poolKey)) {
      return poolKey;
    }
  }
  return getDeepBookEnv().defaultPool;
}

function assetFromCoin(coinKey: string, poolKey: string): "base" | "quote" {
  const pool = getDeepBookEnv().pools[poolKey as keyof ReturnType<typeof getDeepBookEnv>["pools"]];
  if (!pool) {
    return coinKey === "USDC" ? "quote" : "base";
  }
  if (coinKey === pool.baseCoin) {
    return "base";
  }
  if (coinKey === pool.quoteCoin) {
    return "quote";
  }
  return coinKey === "USDC" ? "quote" : "base";
}

export function extractFlashLoanIntent(message: string): FlashLoanIntent | null {
  const pool_key = resolvePoolKey(message);

  const patterns = [
    new RegExp(`([\\d.,]+)\\s*(${COIN_PATTERN})\\b`, "i"),
    new RegExp(`\\b(${COIN_PATTERN})\\s+([\\d.,]+)\\b`, "i"),
    new RegExp(`borrow\\s+([\\d.,]+)\\s*(${COIN_PATTERN})\\b`, "i"),
    new RegExp(`use\\s+([\\d.,]+)\\s*(${COIN_PATTERN})\\b`, "i"),
  ];

  for (const pattern of patterns) {
    const match = message.match(pattern);
    if (!match) {
      continue;
    }

    const amountRaw = match[1].match(/[\d.,]+/) ? match[1] : match[2];
    const coinRaw = match[1].match(/[\d.,]+/) ? match[2] : match[1];
    const borrow_amount = parseAmount(amountRaw);
    if (borrow_amount === null) {
      continue;
    }

    const coin_key = coinRaw.toUpperCase();
    return {
      pool_key,
      borrow_amount,
      asset: assetFromCoin(coin_key, pool_key),
      coin_key,
    };
  }

  return null;
}

export function extractFlashLoanIntentFromMessages(
  messages: AgentTurnMessage[],
): FlashLoanIntent | null {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const message = messages[i];
    if (message.role !== "user") {
      continue;
    }
    const intent = extractFlashLoanIntent(message.content);
    if (intent) {
      return intent;
    }
  }
  return null;
}

export function isAffirmativeFlashLoanReply(message: string): boolean {
  return AFFIRMATIVE_PATTERN.test(message.trim());
}

function isFlashLoanExecuteOutcome(result: unknown): boolean {
  if (typeof result !== "object" || result === null || "error" in result) {
    return false;
  }

  const outcome = result as ExecuteToolOutcome;
  if (outcome.status === "approval_required") {
    return outcome.pending?.action === "deepbook_flash_loan";
  }

  if (outcome.status === "executed") {
    const action = (outcome.result as { deepbook?: { flash_loan?: unknown } } | undefined)
      ?.deepbook?.flash_loan;
    return action !== undefined;
  }

  return false;
}

function hasFlashLoanExecuteAttempt(toolCalls: ToolCallRecord[]): boolean {
  return toolCalls.some(
    (call) =>
      call.name === EXECUTE_TRANSACTION_TOOL_NAME &&
      typeof call.result === "object" &&
      call.result !== null &&
      ((call.result as ExecuteToolOutcome).pending?.action === "deepbook_flash_loan" ||
        isFlashLoanExecuteOutcome(call.result) ||
        ("error" in call.result &&
          (call.result as AgentToolErrorResult).error?.code === "FLASH_LOANS_DISABLED")),
  );
}

/** User named a borrow amount — agent must call deepbook_flash_loan so the approval bar appears. */
export function shouldNudgeFlashLoanExecute(
  toolCalls: ToolCallRecord[],
  lastUserMessage: string,
  messages: AgentTurnMessage[] = [],
): boolean {
  if (hasFlashLoanExecuteAttempt(toolCalls)) {
    return false;
  }

  let intent = extractFlashLoanIntent(lastUserMessage);
  if (!intent && isAffirmativeFlashLoanReply(lastUserMessage)) {
    intent = extractFlashLoanIntentFromMessages(messages);
  }

  if (!intent) {
    return false;
  }

  return (
    userRequestedFlashLoan(lastUserMessage) ||
    messages.some((message) => message.role === "user" && userRequestedFlashLoan(message.content))
  );
}

/** User asked for a flash loan but did not name an amount — ask only for borrow amount/asset, not yes/no confirm. */
export function shouldNudgeFlashLoanMissingAmount(
  toolCalls: ToolCallRecord[],
  lastUserMessage: string,
  messages: AgentTurnMessage[] = [],
): boolean {
  if (hasFlashLoanExecuteAttempt(toolCalls)) {
    return false;
  }
  if (extractFlashLoanIntent(lastUserMessage)) {
    return false;
  }

  const askedFlashLoan =
    userRequestedFlashLoan(lastUserMessage) ||
    messages.some((message) => message.role === "user" && userRequestedFlashLoan(message.content));

  if (!askedFlashLoan) {
    return false;
  }

  return extractFlashLoanIntentFromMessages(messages) === null;
}

export const FLASH_LOAN_MISSING_AMOUNT_NUDGE =
  "The user requested a flash loan but did not specify borrow amount and asset. " +
  "Ask only for borrow_amount and whether they want base or quote (e.g. 10000 USDC). " +
  "Do not ask yes/no to confirm — the app approval dialog is the confirmation.";

export function buildFlashLoanExecuteNudge(intent: FlashLoanIntent): string {
  return (
    `Call execute_transaction now: chain_id sui, action deepbook_flash_loan, ` +
    `params { pool_key: "${intent.pool_key}", borrow_amount: ${intent.borrow_amount}, ` +
    `asset: "${intent.asset}", coin_key: "${intent.coin_key}", strategy: "round_trip" }. ` +
    "For multi-pool routes use strategy swap_chain_repay with steps[] — call query_chain flash_loan_quote first. " +
    "The app shows an approval bar — do not ask me to confirm in chat."
  );
}
