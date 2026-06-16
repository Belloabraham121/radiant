import type { ToolCallRecord } from "../agent.types.js";
import { EXECUTE_TRANSACTION_TOOL_NAME } from "../execute-transaction.tool.js";
import { isDeepBookPredictAction } from "../../defi/deepbook/deepbook-predict.service.js";

export type PredictMintIntent = {
  oracle_id?: string;
  strike?: number;
  is_up: boolean;
  quantity: number;
  expiry?: number;
};

export type PredictRangeIntent = {
  oracle_id?: string;
  lower_strike: number;
  higher_strike: number;
  quantity: number;
  expiry?: number;
};

const BET_UP_PATTERN = /\bbet\s+(?:that\s+)?(\w+)\s+(?:goes?\s+)?(?:above|up|over)\s+([\d.,]+)/i;
const BET_DOWN_PATTERN = /\bbet\s+(?:that\s+)?(\w+)\s+(?:goes?\s+)?(?:below|down|under)\s+([\d.,]+)/i;
const PREDICT_PATTERN = /\bpredict\s+(\w+)\s+(above|below|up|down)\s+([\d.,]+)/i;

export function extractPredictMintIntent(message: string): PredictMintIntent | null {
  let match = message.match(BET_UP_PATTERN);
  if (match) {
    const strike = Number(match[2].replace(/,/g, ""));
    if (!Number.isFinite(strike)) return null;
    const qtyMatch = message.match(/([\d.,]+)\s*(?:usdc|usd|\$)/i);
    const quantity = qtyMatch ? Number(qtyMatch[1].replace(/,/g, "")) : 1;
    return { is_up: true, strike, quantity };
  }

  match = message.match(BET_DOWN_PATTERN);
  if (match) {
    const strike = Number(match[2].replace(/,/g, ""));
    if (!Number.isFinite(strike)) return null;
    const qtyMatch = message.match(/([\d.,]+)\s*(?:usdc|usd|\$)/i);
    const quantity = qtyMatch ? Number(qtyMatch[1].replace(/,/g, "")) : 1;
    return { is_up: false, strike, quantity };
  }

  match = message.match(PREDICT_PATTERN);
  if (match) {
    const direction = match[2].toLowerCase();
    const strike = Number(match[3].replace(/,/g, ""));
    if (!Number.isFinite(strike)) return null;
    const is_up = direction === "above" || direction === "up";
    const qtyMatch = message.match(/([\d.,]+)\s*(?:usdc|usd|\$)/i);
    const quantity = qtyMatch ? Number(qtyMatch[1].replace(/,/g, "")) : 1;
    return { is_up, strike, quantity };
  }

  return null;
}

export function extractPredictRangeIntent(message: string): PredictRangeIntent | null {
  const rangeMatch = message.match(
    /\b(?:range|between)\s+([\d.,]+)\s*(?:and|to|-)\s*([\d.,]+)/i,
  );
  if (!rangeMatch) return null;
  const lower = Number(rangeMatch[1].replace(/,/g, ""));
  const higher = Number(rangeMatch[2].replace(/,/g, ""));
  if (!Number.isFinite(lower) || !Number.isFinite(higher)) return null;
  const qtyMatch = message.match(/([\d.,]+)\s*(?:usdc|usd|\$)/i);
  const quantity = qtyMatch ? Number(qtyMatch[1].replace(/,/g, "")) : 1;
  return { lower_strike: Math.min(lower, higher), higher_strike: Math.max(lower, higher), quantity };
}

export function userRequestedPredictAction(message: string): boolean {
  return (
    /\bpredict\b/i.test(message) ||
    /\bbet\b.*\b(above|below|up|down|over|under)\b/i.test(message) ||
    /\bprediction\s+market/i.test(message) ||
    /\bmint\s+(up|down|binary|range)\b/i.test(message)
  );
}

function isPredictExecuteOutcome(result: unknown): boolean {
  if (typeof result !== "object" || result === null) return false;
  if ("error" in result) return false;
  const outcome = result as { status?: string; pending?: { action?: string } };
  if (outcome.status === "approval_required") {
    return isDeepBookPredictAction(outcome.pending?.action ?? "");
  }
  return outcome.status === "executed";
}

export function shouldNudgePredictExecute(
  toolCalls: ToolCallRecord[],
  lastUserMessage: string,
): boolean {
  if (!userRequestedPredictAction(lastUserMessage)) return false;

  for (const call of toolCalls) {
    if (call.name !== EXECUTE_TRANSACTION_TOOL_NAME) continue;
    if (isPredictExecuteOutcome(call.result)) return false;
  }

  return true;
}

export function buildPredictMintNudge(intent: PredictMintIntent): string {
  const direction = intent.is_up ? "UP" : "DOWN";
  return (
    `First query predict_markets to find the oracle and active expiry. ` +
    `Then query predict_trade_amounts { oracle_id, expiry, strike: ${intent.strike ?? "TBD"}, is_up: ${intent.is_up}, quantity: ${intent.quantity} } to preview cost. ` +
    `Then call execute_transaction: chain_id sui, action deepbook_predict_mint, ` +
    `params { oracle_id, expiry, strike: ${intent.strike ?? "TBD"}, is_up: ${intent.is_up}, quantity: ${intent.quantity} }. ` +
    `Position: ${direction} with quantity ${intent.quantity}.`
  );
}
