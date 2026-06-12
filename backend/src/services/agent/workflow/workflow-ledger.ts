import type { DeepBookSwapQuoteResult } from "../../defi/deepbook-swap.service.js";
import type { TxResult } from "../../chains/types.js";
import type { ToolCallRecord } from "../agent.types.js";
import { EXECUTE_TRANSACTION_TOOL_NAME } from "../execute-transaction.tool.js";
import { QUERY_CHAIN_TOOL_NAME } from "../query-chain.tool.js";
import type { ExecuteToolOutcome } from "../agent.types.js";
import type { PlanSlot } from "./planner.types.js";

export type WorkflowLedgerEntry = {
  step_index: number;
  action: string;
  input_coin?: string;
  input_amount?: number;
  output_coin?: string;
  output_amount_est?: number;
  digest?: string;
};

function isSwapQuote(result: unknown): result is DeepBookSwapQuoteResult {
  return (
    typeof result === "object" &&
    result !== null &&
    "output_amount_display" in result &&
    "input_amount_display" in result
  );
}

function isExecuteOutcome(result: unknown): result is ExecuteToolOutcome {
  return (
    typeof result === "object" &&
    result !== null &&
    "status" in result &&
    ((result as ExecuteToolOutcome).status === "executed" ||
      (result as ExecuteToolOutcome).status === "approval_required")
  );
}

export function ledgerEntryFromToolCalls(
  stepIndex: number,
  action: string,
  params: Record<string, unknown>,
  tool_calls: ToolCallRecord[],
  txResult?: TxResult,
): WorkflowLedgerEntry {
  const entry: WorkflowLedgerEntry = {
    step_index: stepIndex,
    action,
  };

  const inputCoin =
    (params.input_coin as string | undefined) ??
    (params.coin_key as string | undefined) ??
    (params.side === "sell" ? "SUI" : undefined);
  const inputAmount =
    (params.amount as number | undefined) ??
    (params.amount_display as number | undefined) ??
    (params.quantity as number | undefined);

  if (inputCoin) entry.input_coin = String(inputCoin).toUpperCase();
  if (typeof inputAmount === "number") entry.input_amount = inputAmount;

  const quoteCall = tool_calls.find((call) => call.name === QUERY_CHAIN_TOOL_NAME);
  if (quoteCall && isSwapQuote(quoteCall.result)) {
    entry.output_coin = quoteCall.result.output_coin;
    entry.output_amount_est = quoteCall.result.output_amount_display;
  }

  const executeCall = tool_calls.find((call) => call.name === EXECUTE_TRANSACTION_TOOL_NAME);
  if (executeCall && isExecuteOutcome(executeCall.result)) {
    const execParams = executeCall.result.status === "approval_required"
      ? executeCall.result.pending.params
      : params;

    if (action === "swap") {
      const side = execParams.side as string | undefined;
      entry.input_coin =
        (execParams.input_coin as string | undefined)?.toUpperCase() ??
        (side === "buy" ? "USDC" : "SUI");
      entry.output_coin =
        (execParams.output_coin as string | undefined)?.toUpperCase() ??
        (side === "buy" ? "SUI" : "USDC");
      if (typeof execParams.amount === "number") {
        entry.input_amount = execParams.amount;
      }
      if (typeof execParams.estimated_out_display === "number") {
        entry.output_amount_est = execParams.estimated_out_display;
      } else if (typeof execParams.output_amount_display === "number") {
        entry.output_amount_est = execParams.output_amount_display;
      }
    }

    if (action === "deepbook_deposit" || action === "deepbook_withdraw") {
      entry.input_coin = (execParams.coin_key as string | undefined)?.toUpperCase();
      if (typeof execParams.amount_display === "number") {
        entry.input_amount = execParams.amount_display;
      }
      entry.output_coin = entry.input_coin;
      entry.output_amount_est = entry.input_amount;
    }
  }

  if (txResult?.digest) {
    entry.digest = txResult.digest;
  }

  return entry;
}

export function resolvePlanSlot(
  slot: PlanSlot,
  ledger: WorkflowLedgerEntry[],
): { resolved: boolean; value?: string | number | boolean } {
  if (slot.kind === "literal") {
    return { resolved: true, value: slot.value };
  }

  if (slot.kind === "missing") {
    return { resolved: false };
  }

  const entry = ledger.find((item) => item.step_index === slot.step_index);
  if (!entry) {
    return { resolved: false };
  }

  if (slot.field === "output_amount") {
    if (entry.output_amount_est !== undefined) {
      return { resolved: true, value: entry.output_amount_est };
    }
    return { resolved: false };
  }

  if (slot.field === "output_coin") {
    if (entry.output_coin) {
      return { resolved: true, value: entry.output_coin };
    }
    return { resolved: false };
  }

  return { resolved: false };
}

export function resolveParamsFromLedger(
  params: Record<string, PlanSlot | string | number | boolean>,
  ledger: WorkflowLedgerEntry[],
): { resolved: Record<string, unknown>; unresolved: string[] } {
  const resolved: Record<string, unknown> = {};
  const unresolved: string[] = [];

  for (const [key, slot] of Object.entries(params)) {
    if (typeof slot !== "object" || slot === null || !("kind" in slot)) {
      resolved[key] = slot;
      continue;
    }

    const result = resolvePlanSlot(slot as PlanSlot, ledger);
    if (result.resolved) {
      resolved[key] = result.value;
    } else {
      unresolved.push(key);
    }
  }

  return { resolved, unresolved };
}

export function formatLedgerRef(entry: WorkflowLedgerEntry): string {
  const amount = entry.output_amount_est ?? entry.input_amount;
  const coin = entry.output_coin ?? entry.input_coin ?? "tokens";
  if (amount !== undefined) {
    return `~${amount} ${coin}`;
  }
  return coin;
}
