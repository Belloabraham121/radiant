import type { PlanSlot } from "./planner.types.js";
import type { WorkflowPlan } from "./workflow.types.js";
import { isDeepBookCoinKey, isDeepBookPoolKey } from "../../defi/deepbook/coin-key.js";
import { resolvePlanSlot, type WorkflowLedgerEntry } from "./workflow-ledger.js";

export function isPlanSlot(value: unknown): value is PlanSlot {
  return (
    typeof value === "object" &&
    value !== null &&
    "kind" in value &&
    ((value as PlanSlot).kind === "literal" ||
      (value as PlanSlot).kind === "ref" ||
      (value as PlanSlot).kind === "missing")
  );
}

export function coercePositiveNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return value;
  }
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value.replace(/,/g, ""));
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed;
    }
  }
  return undefined;
}

export function flattenPlannedParams(
  params: Record<string, unknown>,
  ledger: WorkflowLedgerEntry[] = [],
): { flat: Record<string, unknown>; unresolved: string[] } {
  const resolved: Record<string, unknown> = {};
  const unresolved: string[] = [];

  for (const [key, value] of Object.entries(params)) {
    if (!isPlanSlot(value)) {
      resolved[key] = value;
      continue;
    }

    const result = resolvePlanSlot(value, ledger);
    if (result.resolved) {
      resolved[key] = result.value;
    } else {
      unresolved.push(key);
    }
  }

  return { flat: resolved, unresolved };
}

export function normalizeExecuteParams(
  action: string,
  params: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(params)) {
    if (!isPlanSlot(value)) {
      out[key] = value;
    }
  }

  const amount =
    coercePositiveNumber(out.amount) ??
    coercePositiveNumber(out.amount_display) ??
    coercePositiveNumber(out.quantity);

  if (amount !== undefined) {
    if (action === "swap") {
      out.amount = amount;
    } else if (action === "deepbook_deposit" || action === "deepbook_withdraw") {
      out.amount_display = amount;
    } else if (
      action === "deepbook_place_limit_order" ||
      action === "deepbook_place_market_order"
    ) {
      out.quantity = amount;
    } else {
      out.amount = amount;
    }
  }

  const price = coercePositiveNumber(out.price);
  if (price !== undefined) {
    out.price = price;
  }

  const quantity = coercePositiveNumber(out.quantity);
  if (
    quantity !== undefined &&
    (action === "deepbook_place_limit_order" || action === "deepbook_place_market_order")
  ) {
    out.quantity = quantity;
  }

  if (typeof out.pool_key === "string") {
    out.pool_key = out.pool_key.trim().toUpperCase().replace(/\s*\/\s*/g, "_");
  }

  if (typeof out.coin_key === "string") {
    out.coin_key = out.coin_key.trim().toUpperCase();
  }

  return out;
}

export type StepParamValidation =
  | { ok: true }
  | { ok: false; message: string; field: string };

export function validateExecuteStepParams(
  action: string,
  params: Record<string, unknown>,
): StepParamValidation {
  if (action === "swap") {
    const amount = coercePositiveNumber(params.amount) ?? coercePositiveNumber(params.amount_display);
    if (!amount) {
      return {
        ok: false,
        field: "amount",
        message: "Swap step is missing a positive amount (e.g. 1.6 SUI).",
      };
    }
    return { ok: true };
  }

  if (action === "deepbook_deposit") {
    const amount = coercePositiveNumber(params.amount_display) ?? coercePositiveNumber(params.amount);
    if (!amount) {
      return {
        ok: false,
        field: "amount_display",
        message: "Deposit step is missing a positive amount.",
      };
    }
    if (typeof params.coin_key !== "string" || !params.coin_key) {
      return {
        ok: false,
        field: "coin_key",
        message: "Deposit step is missing coin_key (e.g. SUI).",
      };
    }
    const coinKey = params.coin_key.trim().toUpperCase();
    if (isDeepBookPoolKey(coinKey)) {
      return {
        ok: false,
        field: "coin_key",
        message: `Deposit coin_key "${coinKey}" looks like a pool key — use SUI or USDC, not a pair like SUI_USDC.`,
      };
    }
    if (!isDeepBookCoinKey(coinKey)) {
      return {
        ok: false,
        field: "coin_key",
        message: `Deposit coin_key "${coinKey}" is not a supported DeepBook coin.`,
      };
    }
    return { ok: true };
  }

  if (action === "deepbook_withdraw") {
    if (params.withdraw_all === true) {
      if (typeof params.coin_key !== "string" || !params.coin_key) {
        return {
          ok: false,
          field: "coin_key",
          message: "Withdraw-all step is missing coin_key.",
        };
      }
      return { ok: true };
    }
    const amount = coercePositiveNumber(params.amount_display) ?? coercePositiveNumber(params.amount);
    if (!amount) {
      return {
        ok: false,
        field: "amount_display",
        message: "Withdraw step is missing a positive amount or withdraw_all.",
      };
    }
    return { ok: true };
  }

  if (action === "deepbook_place_limit_order") {
    const quantity = coercePositiveNumber(params.quantity);
    const price = coercePositiveNumber(params.price);
    if (!quantity) {
      return {
        ok: false,
        field: "quantity",
        message: "Limit order step is missing a positive quantity.",
      };
    }
    if (!price) {
      return {
        ok: false,
        field: "price",
        message: "Limit order step is missing a positive price.",
      };
    }
    return { ok: true };
  }

  if (action === "transfer_sui") {
    const amount =
      coercePositiveNumber(params.amount_display) ??
      coercePositiveNumber(params.amount) ??
      coercePositiveNumber(params.amount_mist);
    if (!amount) {
      return {
        ok: false,
        field: "amount",
        message: "Transfer step is missing a positive amount.",
      };
    }
    return { ok: true };
  }

  return { ok: true };
}

export function normalizeWorkflowPlan(plan: WorkflowPlan): WorkflowPlan {
  return {
    ...plan,
    steps: plan.steps.map((step) => {
      if (step.kind !== "execute") {
        return step;
      }
      return {
        ...step,
        input: {
          ...step.input,
          params: normalizeExecuteParams(
            step.input.action,
            step.input.params as Record<string, unknown>,
          ),
        },
      };
    }),
  };
}

export function validateWorkflowPlan(
  plan: WorkflowPlan,
): { ok: true } | { ok: false; message: string; stepIndex: number } {
  for (let index = 0; index < plan.steps.length; index += 1) {
    const step = plan.steps[index];
    if (step.kind !== "execute") {
      continue;
    }
    const check = validateExecuteStepParams(step.input.action, step.input.params);
    if (!check.ok) {
      return { ok: false, message: check.message, stepIndex: index };
    }
  }
  return { ok: true };
}
