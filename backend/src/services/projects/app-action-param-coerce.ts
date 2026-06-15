import type { AppActionName } from "./app-action.types.js";

/** Coerce LLM / JSON string amounts to numbers before Zod validation. */
export function coerceFiniteNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value.trim().replace(/,/g, ""));
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return undefined;
}

export function coercePositiveNumber(value: unknown): number | undefined {
  const parsed = coerceFiniteNumber(value);
  if (parsed != null && parsed > 0) {
    return parsed;
  }
  return undefined;
}

function coerceFields(
  target: Record<string, unknown>,
  fields: string[],
  coerce: (value: unknown) => number | undefined,
): void {
  for (const field of fields) {
    const coerced = coerce(target[field]);
    if (coerced != null) {
      target[field] = coerced;
    }
  }
}

/**
 * Normalize app action params so numeric fields from the LLM (often strings)
 * pass Zod validation. Mirrors query_chain amount coercion.
 */
export function normalizeAppActionParams(
  action: AppActionName,
  params: unknown,
): Record<string, unknown> {
  if (!params || typeof params !== "object" || Array.isArray(params)) {
    return {};
  }

  const next = { ...(params as Record<string, unknown>) };

  switch (action) {
    case "swap":
      coerceFields(
        next,
        ["amount", "amount_display", "estimated_out_display", "min_out_display"],
        (value) => coercePositiveNumber(value) ?? coerceFiniteNumber(value),
      );
      if (next.slippage_bps != null) {
        const bps = coerceFiniteNumber(next.slippage_bps);
        if (bps != null) {
          next.slippage_bps = bps;
        }
      }
      break;
    case "flash_loan":
      coerceFields(next, ["borrow_amount", "estimated_surplus"], coercePositiveNumber);
      if (Array.isArray(next.steps)) {
        next.steps = next.steps.map((step) => {
          if (!step || typeof step !== "object") {
            return step;
          }
          const row = { ...(step as Record<string, unknown>) };
          const amount = coercePositiveNumber(row.amount);
          if (amount != null) {
            row.amount = amount;
          }
          const minOut = coercePositiveNumber(row.min_out_display);
          if (minOut != null) {
            row.min_out_display = minOut;
          }
          return row;
        });
      }
      break;
    case "stake":
    case "deposit":
    case "withdraw":
      coerceFields(next, ["amount_display"], coercePositiveNumber);
      break;
    case "place_limit_order":
      coerceFields(next, ["price", "quantity"], coercePositiveNumber);
      break;
    case "place_market_order":
      coerceFields(next, ["quantity"], coercePositiveNumber);
      break;
    case "modify_order":
      coerceFields(next, ["quantity"], coercePositiveNumber);
      break;
    case "submit_proposal":
      coerceFields(next, ["taker_fee", "maker_fee", "stake_required"], coerceFiniteNumber);
      break;
    case "transfer":
      coerceFields(next, ["amount_display"], coercePositiveNumber);
      break;
    default:
      break;
  }

  return next;
}
