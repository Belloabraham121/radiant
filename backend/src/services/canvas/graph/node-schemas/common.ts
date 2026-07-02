import { z } from "zod";
import type { CanvasNodeType } from "../canvas-graph.types.js";

export type NodeConfigValidationError = {
  path: string;
  message: string;
};

export type NodeConfigValidationResult =
  | { ok: true }
  | { ok: false; errors: NodeConfigValidationError[] };

const baseNodeConfigSchema = z.object({}).passthrough();

/** Accept numbers or numeric strings from LLM patch_node (reject empty strings). */
function optionalNumber() {
  return z.preprocess((val) => {
    if (val === undefined || val === null || val === "") return undefined;
    if (typeof val === "number") return Number.isFinite(val) ? val : val;
    if (typeof val === "string") {
      const trimmed = val.trim();
      if (trimmed === "") return undefined;
      const n = Number(trimmed);
      return Number.isFinite(n) ? n : val;
    }
    return val;
  }, z.number().optional());
}

function optionalPositiveNumber() {
  return z.preprocess((val) => {
    if (val === undefined || val === null || val === "") return undefined;
    if (typeof val === "number") return Number.isFinite(val) ? val : val;
    if (typeof val === "string") {
      const trimmed = val.trim();
      if (trimmed === "") return undefined;
      const n = Number(trimmed);
      return Number.isFinite(n) ? n : val;
    }
    return val;
  }, z.number().positive().optional());
}

export const workflowStartConfigSchema = z
  .object({
    label: z.string().optional(),
  })
  .passthrough();

export const priceChartConfigSchema = z
  .object({
    pair: z.string().min(1).optional(),
    chart_type: z.enum(["candlestick", "line", "area"]).optional(),
    interval: z.string().optional(),
  })
  .passthrough();

export const lifiSwapConfigSchema = z
  .object({
    from_chain_id: z.number().int().positive().optional(),
    to_chain_id: z.number().int().positive().optional(),
    from_token: z.string().optional(),
    to_token: z.string().optional(),
    slippage_bps: z.number().int().min(0).max(10_000).optional(),
  })
  .passthrough();

export const thresholdConfigSchema = z
  .object({
    metric: z.enum(["mid", "best_bid", "best_ask", "value"]).optional(),
    operator: z.enum(["<", ">", "<=", ">="]).optional(),
    value: optionalNumber(),
    threshold: optionalNumber(),
  })
  .passthrough();

export const ifConditionConfigSchema = z
  .object({
    expression: z.string().optional(),
  })
  .passthrough();

export const compareConfigSchema = z
  .object({
    operator: z.enum([">", "<", ">=", "<=", "==", "="]).optional(),
    b: optionalNumber(),
  })
  .passthrough();

export const notifyConfigSchema = z
  .object({
    channel: z.enum(["in_app", "webhook"]).optional(),
    message: z.string().optional(),
  })
  .passthrough();

export const scheduleCronConfigSchema = z
  .object({
    cron: z.string().optional(),
    interval: z.string().optional(),
  })
  .passthrough();

export const delayConfigSchema = z
  .object({
    duration_seconds: optionalPositiveNumber(),
  })
  .passthrough();

export const polymarketFeedConfigSchema = z
  .object({
    asset_id: z.string().min(1).optional(),
    market: z.string().min(1).optional(),
    token_id: z.string().min(1).optional(),
    depth: z.union([z.string(), z.number()]).optional(),
  })
  .passthrough();

export const placeOrderConfigSchema = z
  .object({
    operation: z.enum(["place_limit", "place_market", "cancel"]).optional(),
    side: z.enum(["buy", "sell"]).optional(),
    size: optionalPositiveNumber(),
    price: z.preprocess((val) => {
      if (val === undefined || val === null || val === "") return undefined;
      if (typeof val === "number") return Number.isFinite(val) ? val : val;
      if (typeof val === "string") {
        const trimmed = val.trim();
        if (trimmed === "") return undefined;
        const n = Number(trimmed);
        return Number.isFinite(n) ? n : val;
      }
      return val;
    }, z.number().min(0).max(1).optional()),
    outcome: z.enum(["yes", "no"]).optional(),
    order_id: z.string().optional(),
  })
  .passthrough();

export const policyGateConfigSchema = z
  .object({
    policy_mode: z.preprocess((val) => {
      if (val === undefined || val === null || val === "") return undefined;
      if (typeof val !== "string") return "inherit";
      const normalized = val.trim().toLowerCase();
      if (normalized === "inherit" || normalized === "override") return normalized;
      return "inherit";
    }, z.enum(["inherit", "override"]).optional()),
    max_single_action_usd: z.number().positive().optional(),
    allowed_actions: z.string().optional(),
    require_approve: z.boolean().optional(),
  })
  .passthrough();

export const uiTableConfigSchema = z
  .object({
    title: z.string().optional(),
    max_rows: optionalPositiveNumber(),
    columns: z.string().optional(),
    highlight_column: z.string().optional(),
  })
  .passthrough();

export const uiLabelConfigSchema = z
  .object({
    label_text: z.string().optional(),
    label: z.string().optional(),
    value_format: z.enum(["plain", "price", "percent"]).optional(),
    prefix: z.string().optional(),
    suffix: z.string().optional(),
  })
  .passthrough();

export const uiChartConfigSchema = z
  .object({
    title: z.string().optional(),
    chart_type: z.enum(["line", "area", "bar"]).optional(),
  })
  .passthrough();

const typedNodeConfigSchemas: Partial<Record<CanvasNodeType, z.ZodType<Record<string, unknown>>>> = {
  workflow_start: workflowStartConfigSchema,
  price_chart: priceChartConfigSchema,
  polymarket_feed: polymarketFeedConfigSchema,
  polymarket_orderbook: polymarketFeedConfigSchema,
  limitless_feed: polymarketFeedConfigSchema,
  place_order: placeOrderConfigSchema,
  polymarket_place_limit: placeOrderConfigSchema,
  polymarket_place_market: placeOrderConfigSchema,
  polymarket_cancel_order: placeOrderConfigSchema,
  policy_gate: policyGateConfigSchema,
  ui_table: uiTableConfigSchema,
  ui_label: uiLabelConfigSchema,
  ui_chart: uiChartConfigSchema,
  lifi_swap: lifiSwapConfigSchema,
  lifi_bridge: lifiSwapConfigSchema,
  lifi_quote: lifiSwapConfigSchema,
  threshold: thresholdConfigSchema,
  if_condition: ifConditionConfigSchema,
  compare: compareConfigSchema,
  notify: notifyConfigSchema,
  schedule_cron: scheduleCronConfigSchema,
  delay: delayConfigSchema,
};

export function getNodeConfigSchema(nodeType: CanvasNodeType): z.ZodType<Record<string, unknown>> {
  return typedNodeConfigSchemas[nodeType] ?? baseNodeConfigSchema;
}

export function validateNodeConfig(
  nodeType: CanvasNodeType,
  config: Record<string, unknown>,
): NodeConfigValidationResult {
  const schema = getNodeConfigSchema(nodeType);
  const parsed = schema.safeParse(config);
  if (parsed.success) {
    return { ok: true };
  }

  return {
    ok: false,
    errors: parsed.error.issues.map((issue) => ({
      path: issue.path.join("."),
      message: issue.message,
    })),
  };
}

export {
  baseNodeConfigSchema,
  typedNodeConfigSchemas,
};
