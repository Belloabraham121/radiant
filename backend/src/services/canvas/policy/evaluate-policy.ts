import type { CanvasNodeType } from "../graph/canvas-graph.types.js";
import type { CanvasPolicy } from "./canvas-policy.types.js";

export type PolicyActionIntent = {
  action_type: CanvasNodeType;
  est_usd?: number;
  from_chain?: string;
  to_chain?: string;
  token_symbol?: string;
};

export type PolicyDenyCode =
  | "POLICY_KILL_SWITCH"
  | "POLICY_ACTION_NOT_ALLOWED"
  | "POLICY_SINGLE_ACTION_CAP"
  | "POLICY_24H_SPEND_CAP"
  | "POLICY_FORBIDDEN_TRANSFER";

export type PolicyEvaluationResult =
  | { allowed: true }
  | { allowed: false; code: PolicyDenyCode; message: string };

const ACTION_NODE_TYPES = new Set<CanvasNodeType>([
  "place_order",
  "polymarket_place_limit",
  "polymarket_place_market",
  "polymarket_cancel_order",
  "lifi_swap",
  "lifi_bridge",
  "lifi_quote",
  "copy_trade",
  "swap_bridge",
]);

function matchesForbiddenTransfer(
  policy: CanvasPolicy,
  intent: PolicyActionIntent,
): PolicyEvaluationResult | null {
  if (!intent.from_chain && !intent.to_chain && !intent.token_symbol) {
    return null;
  }

  for (const rule of policy.forbidden_transfers) {
    const fromMatch = !rule.from_chain || rule.from_chain === intent.from_chain;
    const toMatch = !rule.to_chain || rule.to_chain === intent.to_chain;
    const tokenMatch = !rule.token_symbol || rule.token_symbol === intent.token_symbol;
    if (fromMatch && toMatch && tokenMatch) {
      const parts = [rule.from_chain, rule.to_chain, rule.token_symbol].filter(Boolean);
      return {
        allowed: false,
        code: "POLICY_FORBIDDEN_TRANSFER",
        message: `Transfer blocked by policy rule: ${parts.join(" / ")}`,
      };
    }
  }

  return null;
}

export function evaluatePolicyAction(
  policy: CanvasPolicy,
  intent: PolicyActionIntent,
  spend24hUsd = 0,
): PolicyEvaluationResult {
  if (policy.kill_switch) {
    return {
      allowed: false,
      code: "POLICY_KILL_SWITCH",
      message: "Policy kill switch is enabled.",
    };
  }

  if (ACTION_NODE_TYPES.has(intent.action_type) && !policy.allowed_actions.includes(intent.action_type)) {
    return {
      allowed: false,
      code: "POLICY_ACTION_NOT_ALLOWED",
      message: `Action "${intent.action_type}" is not in policy allowed_actions.`,
    };
  }

  const estUsd = intent.est_usd ?? 0;
  if (estUsd > policy.max_single_action_usd) {
    return {
      allowed: false,
      code: "POLICY_SINGLE_ACTION_CAP",
      message: `Estimated $${estUsd} exceeds max_single_action_usd ($${policy.max_single_action_usd}).`,
    };
  }

  if (spend24hUsd + estUsd > policy.max_spend_usd_24h) {
    return {
      allowed: false,
      code: "POLICY_24H_SPEND_CAP",
      message: `24h spend cap would be exceeded ($${spend24hUsd + estUsd} > $${policy.max_spend_usd_24h}).`,
    };
  }

  const forbidden = matchesForbiddenTransfer(policy, intent);
  if (forbidden && !forbidden.allowed) {
    return forbidden;
  }

  return { allowed: true };
}
