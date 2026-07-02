import type { CanvasNodeType } from "../graph/canvas-graph.types.js";

export const CANVAS_POLICY_VERSION = "1.0.0" as const;

export type CanvasPolicyVersion = typeof CANVAS_POLICY_VERSION;

export type CanvasPolicyRegionProfile = "auto" | "eu-west-2" | "us-east-1";

export type CanvasPolicyForbiddenTransfer = {
  from_chain?: string;
  to_chain?: string;
  token_symbol?: string;
};

export type CanvasPolicyCopyTradeLimits = {
  max_follow_usd_per_trade: number;
  max_slippage_bps: number;
  allowed_leader_wallets?: string[];
};

export type CanvasPolicy = {
  policy_version: CanvasPolicyVersion;
  workflow_id: string;
  max_spend_usd_24h: number;
  max_single_action_usd: number;
  allowed_actions: CanvasNodeType[];
  forbidden_transfers: CanvasPolicyForbiddenTransfer[];
  copy_trade_limits?: CanvasPolicyCopyTradeLimits;
  region_profile: CanvasPolicyRegionProfile;
  kill_switch: boolean;
  require_deploy_approval: boolean;
};
