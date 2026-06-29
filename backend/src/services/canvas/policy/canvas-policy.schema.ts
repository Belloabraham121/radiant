import { z } from "zod";
import { canvasNodeTypeSchema } from "../graph/canvas-graph.schema.js";
import { CANVAS_POLICY_VERSION } from "./canvas-policy.types.js";
import type { CanvasPolicy } from "./canvas-policy.types.js";

export const canvasPolicyForbiddenTransferSchema = z.object({
  from_chain: z.string().min(1).optional(),
  to_chain: z.string().min(1).optional(),
  token_symbol: z.string().min(1).optional(),
});

export const canvasPolicyCopyTradeLimitsSchema = z.object({
  max_follow_usd_per_trade: z.number().positive(),
  max_slippage_bps: z.number().int().min(0).max(10_000),
  allowed_leader_wallets: z.array(z.string().min(1)).optional(),
});

export const canvasPolicySchema = z.object({
  policy_version: z.literal(CANVAS_POLICY_VERSION),
  workflow_id: z.string().uuid(),
  max_spend_usd_24h: z.number().positive().max(10_000_000),
  max_single_action_usd: z.number().positive().max(1_000_000),
  allowed_actions: z.array(canvasNodeTypeSchema).min(1),
  forbidden_transfers: z.array(canvasPolicyForbiddenTransferSchema),
  copy_trade_limits: canvasPolicyCopyTradeLimitsSchema.optional(),
  region_profile: z.enum(["auto", "eu-west-2", "us-east-1"]),
  kill_switch: z.boolean(),
  require_deploy_approval: z.boolean(),
});

const DEFAULT_ALLOWED_ACTIONS = [
  "place_order",
  "lifi_swap",
  "lifi_bridge",
  "lifi_quote",
  "polymarket_place_limit",
  "polymarket_place_market",
  "polymarket_cancel_order",
  "copy_trade",
  "notify",
] as const;

export function createDefaultCanvasPolicy(workflowId: string): CanvasPolicy {
  return {
    policy_version: CANVAS_POLICY_VERSION,
    workflow_id: workflowId,
    max_spend_usd_24h: 1_000,
    max_single_action_usd: 100,
    allowed_actions: [...DEFAULT_ALLOWED_ACTIONS],
    forbidden_transfers: [],
    copy_trade_limits: {
      max_follow_usd_per_trade: 200,
      max_slippage_bps: 100,
    },
    region_profile: "auto",
    kill_switch: false,
    require_deploy_approval: true,
  };
}

export function parseCanvasPolicy(input: unknown): CanvasPolicy {
  return canvasPolicySchema.parse(input);
}

export function safeParseCanvasPolicy(
  input: unknown,
): z.SafeParseReturnType<unknown, CanvasPolicy> {
  return canvasPolicySchema.safeParse(input);
}
