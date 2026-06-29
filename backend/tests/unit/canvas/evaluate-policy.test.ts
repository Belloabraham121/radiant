import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { describe, it } from "node:test";
import { createDefaultCanvasPolicy } from "../../../src/services/canvas/policy/canvas-policy.schema.js";
import { evaluatePolicyAction } from "../../../src/services/canvas/policy/evaluate-policy.js";

describe("evaluatePolicyAction", () => {
  const workflowId = randomUUID();

  it("denies when kill switch is enabled", () => {
    const policy = { ...createDefaultCanvasPolicy(workflowId), kill_switch: true };
    const result = evaluatePolicyAction(policy, {
      action_type: "lifi_swap",
      est_usd: 10,
    });
    assert.equal(result.allowed, false);
    if (!result.allowed) {
      assert.equal(result.code, "POLICY_KILL_SWITCH");
    }
  });

  it("denies disallowed action types", () => {
    const policy = {
      ...createDefaultCanvasPolicy(workflowId),
      allowed_actions: ["notify" as const],
    };
    const result = evaluatePolicyAction(policy, {
      action_type: "polymarket_place_limit",
      est_usd: 10,
    });
    assert.equal(result.allowed, false);
    if (!result.allowed) {
      assert.equal(result.code, "POLICY_ACTION_NOT_ALLOWED");
    }
  });

  it("denies when single action cap exceeded", () => {
    const policy = { ...createDefaultCanvasPolicy(workflowId), max_single_action_usd: 50 };
    const result = evaluatePolicyAction(policy, {
      action_type: "lifi_swap",
      est_usd: 75,
    });
    assert.equal(result.allowed, false);
    if (!result.allowed) {
      assert.equal(result.code, "POLICY_SINGLE_ACTION_CAP");
    }
  });

  it("denies when 24h spend cap would be exceeded", () => {
    const policy = { ...createDefaultCanvasPolicy(workflowId), max_spend_usd_24h: 100 };
    const result = evaluatePolicyAction(
      policy,
      { action_type: "lifi_swap", est_usd: 60 },
      50,
    );
    assert.equal(result.allowed, false);
    if (!result.allowed) {
      assert.equal(result.code, "POLICY_24H_SPEND_CAP");
    }
  });

  it("denies forbidden transfer corridors", () => {
    const policy = {
      ...createDefaultCanvasPolicy(workflowId),
      forbidden_transfers: [{ from_chain: "ethereum", to_chain: "polygon", token_symbol: "USDC" }],
    };
    const result = evaluatePolicyAction(policy, {
      action_type: "lifi_bridge",
      est_usd: 10,
      from_chain: "ethereum",
      to_chain: "polygon",
      token_symbol: "USDC",
    });
    assert.equal(result.allowed, false);
    if (!result.allowed) {
      assert.equal(result.code, "POLICY_FORBIDDEN_TRANSFER");
    }
  });

  it("allows valid action within caps", () => {
    const policy = createDefaultCanvasPolicy(workflowId);
    const result = evaluatePolicyAction(policy, {
      action_type: "lifi_swap",
      est_usd: 25,
    });
    assert.equal(result.allowed, true);
  });
});
