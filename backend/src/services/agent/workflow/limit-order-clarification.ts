import { getDeepBookEnv } from "../../../config/deepbook.js";
import {
  getDeepBookPoolInfo,
  type DeepBookPoolInfo,
} from "../../defi/deepbook/deepbook-pools.service.js";
import {
  formatConstraintNumber,
  snapToStep,
} from "../../defi/deepbook/order-constraints.js";
import type {
  ClarificationGap,
  ClarificationSuggestion,
} from "./clarification.types.js";
import type { WorkflowPlan, WorkflowStep } from "./workflow.types.js";

type LimitOrderParams = {
  pool_key?: string;
  quantity?: number;
  price?: number;
  side?: "buy" | "sell";
};

function limitOrderStepParams(step: WorkflowStep): LimitOrderParams | null {
  if (step.kind !== "execute" || step.input.action !== "deepbook_place_limit_order") {
    return null;
  }
  return step.input.params as LimitOrderParams;
}

function formatPriceHint(pool: DeepBookPoolInfo, tickSize: number): string {
  const parts = [
    `On ${pool.pool_key}, limit prices are in ${pool.quote_coin} per ${pool.base_coin} ` +
      `and must land on tick size ${formatConstraintNumber(tickSize)}.`,
  ];

  const onChain = pool.on_chain;
  if (onChain) {
    parts.push(
      `Min order size is ${formatConstraintNumber(onChain.min_size)} ${pool.base_coin}; ` +
        `quantity steps in lot size ${formatConstraintNumber(onChain.lot_size)} ${pool.base_coin}.`,
    );
  }

  const lastPrice = pool.ticker?.last_price;
  if (lastPrice && lastPrice > 0) {
    parts.push(
      `Last traded price is about ${formatConstraintNumber(lastPrice)} ${pool.quote_coin} per ${pool.base_coin}.`,
    );
  }

  return parts.join(" ");
}

export function buildLimitOrderPriceSuggestions(
  pool: DeepBookPoolInfo,
  side: "buy" | "sell",
  attemptedPrice?: number,
): ClarificationSuggestion[] {
  const tickSize = pool.on_chain?.tick_size ?? 0;
  if (tickSize <= 0) {
    return [];
  }

  const suggestions: ClarificationSuggestion[] = [];
  const seen = new Set<number>();

  const pushSuggestion = (label: string, rawValue: number, mode: "nearest" | "down" | "up" = "nearest") => {
    const value = snapToStep(rawValue, tickSize, mode);
    if (!Number.isFinite(value) || value <= 0 || seen.has(value)) {
      return;
    }
    seen.add(value);
    suggestions.push({
      label,
      value,
    });
  };

  const market = pool.ticker?.last_price;
  if (market && market > 0) {
    const snappedMarket = snapToStep(market, tickSize);
    pushSuggestion(
      `Use market price (${formatConstraintNumber(snappedMarket)} ${pool.quote_coin})`,
      snappedMarket,
    );

    if (side === "buy") {
      pushSuggestion(
        `1% below market (${formatConstraintNumber(snapToStep(market * 0.99, tickSize, "down"))} ${pool.quote_coin})`,
        market * 0.99,
        "down",
      );
    } else {
      pushSuggestion(
        `1% above market (${formatConstraintNumber(snapToStep(market * 1.01, tickSize, "up"))} ${pool.quote_coin})`,
        market * 1.01,
        "up",
      );
    }
  }

  if (attemptedPrice !== undefined && Number.isFinite(attemptedPrice) && attemptedPrice > 0) {
    const snapped = snapToStep(attemptedPrice, tickSize);
    pushSuggestion(
      `Use ${formatConstraintNumber(attemptedPrice)} rounded to tick (${formatConstraintNumber(snapped)} ${pool.quote_coin})`,
      snapped,
    );
  }

  return suggestions.slice(0, 4);
}

export function buildLimitOrderQuantitySuggestions(
  pool: DeepBookPoolInfo,
  attemptedQuantity?: number,
): ClarificationSuggestion[] {
  const lotSize = pool.on_chain?.lot_size ?? 0;
  const minSize = pool.on_chain?.min_size ?? 0;
  if (lotSize <= 0 && minSize <= 0) {
    return [];
  }

  const suggestions: ClarificationSuggestion[] = [];
  const seen = new Set<number>();

  const pushSuggestion = (label: string, rawValue: number) => {
    const step = lotSize > 0 ? lotSize : minSize;
    const value = snapToStep(Math.max(rawValue, minSize || rawValue), step, "up");
    if (!Number.isFinite(value) || value <= 0 || seen.has(value)) {
      return;
    }
    seen.add(value);
    suggestions.push({ label, value });
  };

  if (minSize > 0) {
    pushSuggestion(`Minimum size (${formatConstraintNumber(minSize)} ${pool.base_coin})`, minSize);
  }
  if (lotSize > 0 && minSize > 0 && lotSize !== minSize) {
    pushSuggestion(
      `Min + one lot (${formatConstraintNumber(minSize + lotSize)} ${pool.base_coin})`,
      minSize + lotSize,
    );
  }
  if (attemptedQuantity !== undefined && Number.isFinite(attemptedQuantity) && attemptedQuantity > 0) {
    pushSuggestion(
      `Round ${formatConstraintNumber(attemptedQuantity)} to valid lot size`,
      attemptedQuantity,
    );
  }

  return suggestions.slice(0, 3);
}

export async function enrichLimitOrderClarificationGap(
  plan: WorkflowPlan,
  gap: ClarificationGap,
): Promise<ClarificationGap> {
  const step = plan.steps[gap.step_index];
  if (!step) {
    return gap;
  }

  const params = limitOrderStepParams(step);
  if (!params) {
    return gap;
  }

  const poolKey = params.pool_key ?? getDeepBookEnv().defaultPool;
  let pool: DeepBookPoolInfo;
  try {
    pool = await getDeepBookPoolInfo(poolKey);
  } catch {
    return gap;
  }

  const side = params.side === "sell" ? "sell" : "buy";
  const tickSize = pool.on_chain?.tick_size;

  if (gap.field === "price" && tickSize && tickSize > 0) {
    const attempted =
      typeof params.price === "number" && Number.isFinite(params.price) ? params.price : undefined;
    const suggestions = buildLimitOrderPriceSuggestions(pool, side, attempted);

    return {
      ...gap,
      interaction_type: "input",
      question:
        gap.question +
        (attempted !== undefined
          ? ` (${formatConstraintNumber(attempted)} must align to tick size ${formatConstraintNumber(tickSize)}.)`
          : ""),
      hint: formatPriceHint(pool, tickSize),
      placeholder: `e.g. ${formatConstraintNumber(snapToStep(pool.ticker?.last_price ?? tickSize * 100, tickSize))}`,
      suggestions,
    };
  }

  if (gap.field === "quantity" && pool.on_chain) {
    const attempted =
      typeof params.quantity === "number" && Number.isFinite(params.quantity)
        ? params.quantity
        : undefined;
    const suggestions = buildLimitOrderQuantitySuggestions(pool, attempted);
    const lotSize = pool.on_chain.lot_size;
    const minSize = pool.on_chain.min_size;

    return {
      ...gap,
      hint:
        `Quantity on ${pool.pool_key} must be at least ${formatConstraintNumber(minSize)} ${pool.base_coin}` +
        (lotSize > 0
          ? ` and a multiple of lot size ${formatConstraintNumber(lotSize)} ${pool.base_coin}.`
          : "."),
      suggestions,
      placeholder: `e.g. ${formatConstraintNumber(minSize)}`,
    };
  }

  return gap;
}

export async function enrichClarificationGaps(
  plan: WorkflowPlan,
  gaps: ClarificationGap[],
): Promise<ClarificationGap[]> {
  const enriched: ClarificationGap[] = [];
  for (const gap of gaps) {
    if (
      gap.action === "deepbook_place_limit_order" &&
      (gap.field === "price" || gap.field === "quantity")
    ) {
      enriched.push(await enrichLimitOrderClarificationGap(plan, gap));
    } else {
      enriched.push(gap);
    }
  }
  return enriched;
}

const TICK_SIZE_ERROR = /tick_size\s+([0-9.]+)/i;
const LOT_SIZE_ERROR = /lot_size\s+([0-9.]+)\s+(\w+)/i;

export async function buildLimitOrderRetryGap(
  plan: WorkflowPlan,
  stepIndex: number,
  errorMessage: string,
): Promise<ClarificationGap | null> {
  const step = plan.steps[stepIndex];
  const params = step ? limitOrderStepParams(step) : null;
  if (!params) {
    return null;
  }

  const tickMatch = errorMessage.match(TICK_SIZE_ERROR);
  if (tickMatch) {
    const attempted = typeof params.price === "number" ? params.price : undefined;
    const baseGap: ClarificationGap = {
      gap_id: `step${stepIndex}.price.retry`,
      interaction_type: "input",
      question: `That limit price is not valid for ${params.pool_key ?? "this pool"}. Pick a price on the allowed tick grid.`,
      step_index: stepIndex,
      field: "price",
      action: "deepbook_place_limit_order",
      kind: "intent",
      input_kind: "number",
    };
    return enrichLimitOrderClarificationGap(plan, baseGap);
  }

  const lotMatch = errorMessage.match(LOT_SIZE_ERROR);
  if (lotMatch) {
    const attempted = typeof params.quantity === "number" ? params.quantity : undefined;
    const baseGap: ClarificationGap = {
      gap_id: `step${stepIndex}.quantity.retry`,
      interaction_type: "input",
      question: `That order size is not valid for ${params.pool_key ?? "this pool"}. Pick a size that matches the pool lot rules.`,
      step_index: stepIndex,
      field: "quantity",
      action: "deepbook_place_limit_order",
      kind: "intent",
      input_kind: "number",
    };
    return enrichLimitOrderClarificationGap(plan, baseGap);
  }

  return null;
}

export async function snapLimitOrderFieldValue(
  plan: WorkflowPlan,
  gap: ClarificationGap,
  value: number,
): Promise<number> {
  if (gap.action !== "deepbook_place_limit_order" || !gap.field) {
    return value;
  }

  const step = plan.steps[gap.step_index];
  const params = step ? limitOrderStepParams(step) : null;
  if (!params) {
    return value;
  }

  const poolKey = params.pool_key ?? getDeepBookEnv().defaultPool;
  try {
    const pool = await getDeepBookPoolInfo(poolKey);
    if (gap.field === "price" && pool.on_chain?.tick_size) {
      return snapToStep(value, pool.on_chain.tick_size);
    }
    if (gap.field === "quantity" && pool.on_chain?.lot_size) {
      const minSize = pool.on_chain.min_size ?? 0;
      const snapped = snapToStep(value, pool.on_chain.lot_size, "nearest");
      return Math.max(snapped, minSize);
    }
  } catch {
    return value;
  }

  return value;
}
