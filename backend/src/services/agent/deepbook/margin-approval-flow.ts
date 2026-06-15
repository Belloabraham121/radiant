import type { ToolCallRecord } from "../agent.types.js";
import { EXECUTE_TRANSACTION_TOOL_NAME } from "../execute-transaction.tool.js";
import { isDeepBookMarginAction } from "../../defi/deepbook/deepbook-margin.service.js";

export type MarginDepositIntent = {
  coin_type: "base" | "quote" | "deep";
  amount: number;
  margin_manager_key?: string;
};

export type MarginBorrowIntent = {
  asset: "base" | "quote";
  amount: number;
  margin_manager_key?: string;
};

export type MarginOrderIntent = {
  pool_key: string;
  margin_manager_key?: string;
  quantity: number;
  is_bid: boolean;
  price?: number;
  leverage?: number;
};

const MARGIN_DEPOSIT_PATTERN =
  /\bmargin\s+deposit\s+([\d.,]+)\s*(sui|usdc|deep|base|quote)\b/i;

const MARGIN_BORROW_PATTERN =
  /\bmargin\s+borrow\s+([\d.,]+)\s*(sui|usdc|base|quote)\b/i;

const LEVERAGE_PATTERN = /\b(\d+)\s*x\s+(long|short)\b/i;

export function extractMarginDepositIntent(message: string): MarginDepositIntent | null {
  const match = message.match(MARGIN_DEPOSIT_PATTERN);
  if (!match) return null;
  const amount = Number(match[1].replace(/,/g, ""));
  if (!Number.isFinite(amount) || amount <= 0) return null;
  const raw = match[2].toLowerCase();
  const coinType = raw === "sui" || raw === "base" ? "base" : raw === "deep" ? "deep" : "quote";
  return { coin_type: coinType, amount };
}

export function extractMarginBorrowIntent(message: string): MarginBorrowIntent | null {
  const match = message.match(MARGIN_BORROW_PATTERN);
  if (!match) return null;
  const amount = Number(match[1].replace(/,/g, ""));
  if (!Number.isFinite(amount) || amount <= 0) return null;
  const raw = match[2].toLowerCase();
  const asset = raw === "sui" || raw === "base" ? "base" : "quote";
  return { asset, amount };
}

export function extractLeverageOrderIntent(message: string): MarginOrderIntent | null {
  const match = message.match(LEVERAGE_PATTERN);
  if (!match) return null;
  const leverage = Number(match[1]);
  const direction = match[2].toLowerCase();
  const quantityMatch = message.match(/([\d.,]+)\s*(sui|usdc)/i);
  if (!quantityMatch) return null;
  const quantity = Number(quantityMatch[1].replace(/,/g, ""));
  if (!Number.isFinite(quantity) || quantity <= 0) return null;
  return {
    pool_key: "SUI_DBUSDC",
    quantity,
    is_bid: direction === "long",
    leverage,
  };
}

export function userRequestedMarginAction(message: string): boolean {
  return (
    /\bmargin\b/i.test(message) ||
    /\bleverag/i.test(message) ||
    /\b\d+x\s+(long|short)\b/i.test(message)
  );
}

function isMarginExecuteOutcome(result: unknown): boolean {
  if (typeof result !== "object" || result === null) return false;
  if ("error" in result) return false;
  const outcome = result as { status?: string; pending?: { action?: string } };
  if (outcome.status === "approval_required") {
    return isDeepBookMarginAction(outcome.pending?.action ?? "");
  }
  return outcome.status === "executed";
}

export function shouldNudgeMarginExecute(
  toolCalls: ToolCallRecord[],
  lastUserMessage: string,
): boolean {
  if (!userRequestedMarginAction(lastUserMessage)) return false;

  for (const call of toolCalls) {
    if (call.name !== EXECUTE_TRANSACTION_TOOL_NAME) continue;
    if (isMarginExecuteOutcome(call.result)) return false;
  }

  return !toolCalls.some(
    (c) => c.name === EXECUTE_TRANSACTION_TOOL_NAME && isMarginExecuteOutcome(c.result),
  );
}

export function buildMarginDepositNudge(intent: MarginDepositIntent): string {
  return (
    `Call execute_transaction now: chain_id sui, action deepbook_margin_deposit, ` +
    `params { margin_manager_key: "default", coin_type: "${intent.coin_type}", amount: ${intent.amount} }. ` +
    "Approval will be shown in the app — do not ask to confirm in chat."
  );
}

export function buildMarginBorrowNudge(intent: MarginBorrowIntent): string {
  return (
    `Call execute_transaction now: chain_id sui, action deepbook_margin_borrow, ` +
    `params { margin_manager_key: "default", asset: "${intent.asset}", amount: ${intent.amount} }. ` +
    "WARNING: Check risk ratio first with query_chain margin_manager_info."
  );
}
