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
    value: z.number().optional(),
    threshold: z.number().optional(),
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
    b: z.number().optional(),
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
    duration_seconds: z.number().int().positive().optional(),
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

const typedNodeConfigSchemas: Partial<Record<CanvasNodeType, z.ZodType<Record<string, unknown>>>> = {
  workflow_start: workflowStartConfigSchema,
  price_chart: priceChartConfigSchema,
  polymarket_feed: polymarketFeedConfigSchema,
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
