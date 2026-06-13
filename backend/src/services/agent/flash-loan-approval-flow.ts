import type { FlashLoanBundleQuoteResult } from "../defi/deepbook-flash-loan.types.js";
import type { AgentToolErrorResult } from "./tools.js";
import type { ExecuteToolOutcome, ToolCallRecord } from "./agent.types.js";
import type { AgentTurnMessage } from "./runtime/types.js";
import { EXECUTE_TRANSACTION_TOOL_NAME } from "./execute-transaction.tool.js";
import { QUERY_CHAIN_TOOL_NAME } from "./query-chain.tool.js";
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

export function userRequestedMultiPoolFlashLoan(message: string): boolean {
  return (
    /\bbetween\b.+\bpool/i.test(message) ||
    extractPoolKeysFromText(message).length >= 2
  );
}

export function extractPoolKeysFromText(message: string): string[] {
  const normalized = message.toUpperCase().replace(/\//g, "_");
  const pools = Object.keys(getDeepBookEnv().pools);
  return pools.filter((poolKey) => normalized.includes(poolKey));
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
  const mentioned = extractPoolKeysFromText(message);
  if (mentioned.length > 0) {
    return mentioned[0];
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

function isFlashLoanQuoteResult(result: unknown): result is FlashLoanBundleQuoteResult {
  return (
    typeof result === "object" &&
    result !== null &&
    "strategy" in result &&
    "repay_feasible" in result &&
    "steps" in result &&
    !("error" in result)
  );
}

export function findLatestFlashLoanQuote(
  toolCalls: ToolCallRecord[],
): FlashLoanBundleQuoteResult | null {
  for (let i = toolCalls.length - 1; i >= 0; i -= 1) {
    const call = toolCalls[i];
    if (call.name === QUERY_CHAIN_TOOL_NAME && isFlashLoanQuoteResult(call.result)) {
      return call.result;
    }
  }
  return null;
}

function isFlashLoanPendingOutcome(result: unknown): boolean {
  if (typeof result !== "object" || result === null || "error" in result) {
    return false;
  }

  const outcome = result as ExecuteToolOutcome;
  return (
    outcome.status === "approval_required" &&
    outcome.pending.action === "deepbook_flash_loan"
  );
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
      (isFlashLoanPendingOutcome(call.result) ||
        isFlashLoanExecuteOutcome(call.result) ||
        ("error" in call.result &&
          (call.result as AgentToolErrorResult).error?.code === "FLASH_LOANS_DISABLED")),
  );
}

function hasFlashLoanQuoteAttempt(toolCalls: ToolCallRecord[]): boolean {
  return toolCalls.some(
    (call) => call.name === QUERY_CHAIN_TOOL_NAME && isFlashLoanQuoteResult(call.result),
  );
}

function flashLoanContextFromMessages(
  lastUserMessage: string,
  messages: AgentTurnMessage[],
): boolean {
  return (
    userRequestedFlashLoan(lastUserMessage) ||
    messages.some((message) => message.role === "user" && userRequestedFlashLoan(message.content))
  );
}

function resolveIntent(
  lastUserMessage: string,
  messages: AgentTurnMessage[],
): FlashLoanIntent | null {
  let intent = extractFlashLoanIntent(lastUserMessage);
  if (!intent && isAffirmativeFlashLoanReply(lastUserMessage)) {
    intent = extractFlashLoanIntentFromMessages(messages);
  }
  return intent;
}

function flashLoanUserMessages(messages: AgentTurnMessage[]): string[] {
  return messages
    .filter((message) => message.role === "user" && userRequestedFlashLoan(message.content))
    .map((message) => message.content.trim());
}

/** Summarize what the user asked for — context for the agent, not a strategy prescription. */
export function summarizeFlashLoanUserRequest(
  lastUserMessage: string,
  messages: AgentTurnMessage[],
  intent: FlashLoanIntent,
): string {
  const flashLoanTurns = flashLoanUserMessages(messages);
  const requestText =
    flashLoanTurns.length > 0 ? flashLoanTurns.join(" → ") : lastUserMessage.trim();
  const pools = extractPoolKeysFromText(
    [requestText, lastUserMessage, ...messages.map((m) => m.content)].join(" "),
  );
  const poolHint =
    pools.length > 0 ? `pools mentioned: ${pools.join(", ")}` : `borrow pool: ${intent.pool_key}`;
  return (
    `"${requestText}" — borrow ${intent.borrow_amount} ${intent.coin_key} (${intent.asset}) on ${intent.pool_key}; ${poolHint}`
  );
}

/** User gave borrow amount — nudge the agent to act; strategy choice stays with the LLM. */
export function shouldNudgeFlashLoanProceed(
  toolCalls: ToolCallRecord[],
  lastUserMessage: string,
  messages: AgentTurnMessage[] = [],
): boolean {
  if (hasFlashLoanExecuteAttempt(toolCalls) || hasFlashLoanQuoteAttempt(toolCalls)) {
    return false;
  }

  const intent = resolveIntent(lastUserMessage, messages);
  if (!intent || !flashLoanContextFromMessages(lastUserMessage, messages)) {
    return false;
  }

  return true;
}

/** After flash_loan_quote, call execute with min_out_display from the quote. */
export function shouldNudgeFlashLoanExecuteAfterQuote(
  toolCalls: ToolCallRecord[],
  lastUserMessage: string,
  messages: AgentTurnMessage[] = [],
): boolean {
  if (hasFlashLoanExecuteAttempt(toolCalls)) {
    return false;
  }

  const quote = findLatestFlashLoanQuote(toolCalls);
  if (!quote || quote.strategy !== "swap_chain_repay") {
    return false;
  }

  return flashLoanContextFromMessages(lastUserMessage, messages);
}

/** User asked for a flash loan but did not name an amount — ask only for borrow amount/asset, not yes/no confirm. */
export function shouldNudgeFlashLoanMissingAmount(
  toolCalls: ToolCallRecord[],
  lastUserMessage: string,
  messages: AgentTurnMessage[] = [],
): boolean {
  if (hasFlashLoanExecuteAttempt(toolCalls) || hasFlashLoanQuoteAttempt(toolCalls)) {
    return false;
  }
  if (extractFlashLoanIntent(lastUserMessage)) {
    return false;
  }

  const askedFlashLoan = flashLoanContextFromMessages(lastUserMessage, messages);
  if (!askedFlashLoan) {
    return false;
  }

  return extractFlashLoanIntentFromMessages(messages) === null;
}

export const FLASH_LOAN_MISSING_AMOUNT_NUDGE =
  "The user requested a flash loan but did not specify borrow amount and asset. " +
  "Ask only for borrow_amount and whether they want base or quote (e.g. 10000 USDC). " +
  "Do not ask yes/no to confirm — the app approval dialog is the confirmation.";

export const FLASH_LOAN_EXECUTE_AFTER_QUOTE_NUDGE =
  "The flash_loan_quote result is ready. If repay_feasible is true, call execute_transaction deepbook_flash_loan " +
  "with the same borrow params, strategy, and steps as the quote, including each step min_out_display. " +
  "If repay_feasible was false, explain why and do not execute. The app shows an approval dialog — do not ask me to confirm in chat.";

export function buildFlashLoanProceedNudge(
  intent: FlashLoanIntent,
  lastUserMessage: string,
  messages: AgentTurnMessage[],
): string {
  const summary = summarizeFlashLoanUserRequest(lastUserMessage, messages, intent);
  return (
    `The user requested a flash loan: ${summary}. ` +
    "You choose the strategy from their natural language — do not use a fixed rule. " +
    "round_trip: atomic borrow+repay on one pool with no swaps (e.g. simple round trip, borrow and return same asset on same pool). " +
    "swap_chain_repay: borrow then one or more swaps then repay in one PTB (e.g. cross-pool routes, arb between pools, convert borrowed asset before repay). " +
    "For swap_chain_repay, call query_chain flash_loan_quote with your chosen pool_key, borrow_amount, asset, strategy, and steps; " +
    "if repay_feasible is true, call execute_transaction deepbook_flash_loan in the same turn with the same params and min_out_display per quoted step. " +
    "For round_trip, call execute_transaction deepbook_flash_loan directly with pool_key, borrow_amount, asset, and strategy round_trip. " +
    "If repay_feasible is false, explain and do not execute. The app approval dialog is the confirmation — do not ask in chat."
  );
}

export function buildFlashLoanExecuteNudgeFromQuote(
  quote: FlashLoanBundleQuoteResult,
): string {
  const stepsJson = quote.steps
    .map(
      (step) =>
        `{ pool_key: "${step.pool_key}", side: "${step.side}", amount: ${step.in_amount}, min_out_display: ${step.min_out} }`,
    )
    .join(", ");

  return (
    `Call execute_transaction now: chain_id sui, action deepbook_flash_loan, ` +
    `params { pool_key: "${quote.pool_key}", borrow_amount: ${quote.borrow_amount}, ` +
    `asset: "${quote.asset}", strategy: "swap_chain_repay", ` +
    `steps: [${stepsJson}] }. ` +
    `repay_feasible: ${quote.repay_feasible}. ` +
    (quote.repay_feasible
      ? "The app shows an approval bar — do not ask me to confirm in chat."
      : "Do not execute — explain why repay is not feasible.")
  );
}

/** Human-readable chat reply from a flash_loan_quote tool result. */
export function formatFlashLoanQuoteReply(quote: FlashLoanBundleQuoteResult): string {
  const stepLines = quote.steps.map(
    (step, index) =>
      `Step ${index + 1}: ${step.side} ${step.in_amount} ${step.input_coin} → ~${step.out_est} ${step.output_coin} on ${step.pool_key}`,
  );

  const lines = [
    `Flash loan quote (${quote.strategy}) — borrow ${quote.borrow_amount} ${quote.coin_key} from ${quote.pool_key}.`,
    ...stepLines,
    `Repay feasible at quoted mins: ${quote.repay_feasible ? "yes" : "no"}.`,
  ];

  if (quote.estimated_surplus != null) {
    lines.push(`Estimated surplus: ${quote.estimated_surplus} ${quote.coin_key}.`);
  }

  if (quote.warnings.length > 0) {
    lines.push(`Warnings: ${quote.warnings.join(" ")}`);
  }

  if (!quote.repay_feasible) {
    lines.push(
      "I can't execute this bundle — swap outputs wouldn't cover the borrow for an atomic repay. " +
        "Try a smaller amount, a different route, or wait for better prices.",
    );
  }

  return lines.join("\n");
}

export function shouldFinalizeFlashLoanQuoteReply(
  toolCalls: ToolCallRecord[],
  hasPending: boolean,
): FlashLoanBundleQuoteResult | null {
  if (hasPending) {
    return null;
  }

  const quote = findLatestFlashLoanQuote(toolCalls);
  if (!quote?.repay_feasible) {
    return quote;
  }

  return null;
}

export function isFlashLoanRepayNotFeasibleError(message: string): boolean {
  return /repay is not feasible|repay_feasible:\s*false/i.test(message);
}
