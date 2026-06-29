import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { describe, it } from "node:test";
import {
  formatEditScopeHint,
  inferEditPatchScopeSlugs,
  sanitizeBuilderPatchConfig,
  validateBuilderNodeConfig,
} from "../../../src/services/canvas/build/builder-config-catalog.js";
import { validateNodeConfig } from "../../../src/services/canvas/graph/node-schemas/common.js";
import { validateCanvasGraph } from "../../../src/services/canvas/graph/validate-graph.js";
import { slugToNodeType } from "../../../src/services/canvas/graph/node-slug-map.js";
import type { CanvasGraph } from "../../../src/services/canvas/graph/canvas-graph.types.js";

describe("builder patch validation", () => {
  it("coerces string size and value in sanitizeBuilderPatchConfig", () => {
    const threshold = sanitizeBuilderPatchConfig("threshold", {
      metric: "mid",
      operator: "<",
      value: "0.35",
    });
    assert.equal(threshold.value, 0.35);

    const order = sanitizeBuilderPatchConfig("polymarket_place_market", {
      operation: "place_market",
      side: "buy",
      size: "2",
      outcome: "yes",
    });
    assert.equal(order.size, 2);
  });

  it("strips internal catalog keys from patch config", () => {
    const cleaned = sanitizeBuilderPatchConfig("threshold", {
      metric: "mid",
      _catalog_slug: "threshold",
      value: 0.35,
    });
    assert.equal(cleaned._catalog_slug, undefined);
    assert.equal(cleaned.value, 0.35);
  });

  it("validateCanvasGraph accepts numeric-string patches after sanitize", () => {
    const orderId = randomUUID();
    const thresholdId = randomUUID();

    const orderConfig = sanitizeBuilderPatchConfig("polymarket_place_market", {
      operation: "place_market",
      side: "buy",
      size: "2",
      outcome: "yes",
    });
    const thresholdConfig = sanitizeBuilderPatchConfig("threshold", {
      metric: "mid",
      operator: "<",
      value: "0.35",
    });

    const graph: CanvasGraph = {
      nodes: [
        {
          id: orderId,
          type: slugToNodeType("polymarket-place-market")!,
          position: { x: 0, y: 0 },
          config: orderConfig,
        },
        {
          id: thresholdId,
          type: slugToNodeType("threshold")!,
          position: { x: 0, y: 0 },
          config: thresholdConfig,
        },
      ],
      edges: [],
    };

    const result = validateCanvasGraph(graph);
    assert.equal(result.ok, true, JSON.stringify(result));
    assert.deepEqual(validateBuilderNodeConfig(graph), []);
  });

  it("validateCanvasGraph accepts native numeric order and threshold config", () => {
    const graph: CanvasGraph = {
      nodes: [
        {
          id: randomUUID(),
          type: "polymarket_place_market",
          position: { x: 0, y: 0 },
          config: { operation: "place_market", side: "buy", size: 2, outcome: "yes" },
        },
        {
          id: randomUUID(),
          type: "threshold",
          position: { x: 0, y: 0 },
          config: { metric: "mid", operator: "<", value: 0.35 },
        },
      ],
      edges: [],
    };

    const result = validateCanvasGraph(graph);
    assert.equal(result.ok, true);
    assert.deepEqual(validateBuilderNodeConfig(graph), []);
  });

  it("merged patch config passes graph validation after sanitize", () => {
    const existingConfig = { side: "buy", size: 50, outcome: "yes" };
    const patch = { size: "2", operation: "place_market" };
    const merged = sanitizeBuilderPatchConfig("polymarket_place_market", {
      ...existingConfig,
      ...patch,
    });

    const graph: CanvasGraph = {
      nodes: [
        {
          id: randomUUID(),
          type: "polymarket_place_market",
          position: { x: 0, y: 0 },
          config: merged,
        },
      ],
      edges: [],
    };

    assert.equal(merged.size, 2);
    assert.equal(validateCanvasGraph(graph).ok, true);
  });

  it("maps invalid policy_mode live to inherit in sanitizeBuilderPatchConfig", () => {
    const cleaned = sanitizeBuilderPatchConfig("policy_gate", {
      policy_mode: "live",
      max_single_action_usd: 100,
    });
    assert.equal(cleaned.policy_mode, "inherit");
    assert.equal(cleaned.max_single_action_usd, 100);
  });

  it("preserves valid policy_mode inherit and override", () => {
    assert.equal(
      sanitizeBuilderPatchConfig("policy_gate", { policy_mode: "inherit" }).policy_mode,
      "inherit",
    );
    assert.equal(
      sanitizeBuilderPatchConfig("policy_gate", { policy_mode: "override" }).policy_mode,
      "override",
    );
  });

  it("validateNodeConfig accepts policy_mode live after sanitize coercion", () => {
    const config = sanitizeBuilderPatchConfig("policy_gate", { policy_mode: "live" });
    const result = validateNodeConfig("policy_gate", config);
    assert.equal(result.ok, true, JSON.stringify(result));
  });

  it("inferEditPatchScopeSlugs limits order and threshold edits", () => {
    const message = "place market order $2, buy threshold at 0.35";
    const slugs = inferEditPatchScopeSlugs(message);
    assert.ok(slugs);
    assert.ok(slugs.includes("polymarket-place-market"));
    assert.ok(slugs.includes("threshold"));
    assert.ok(!slugs.includes("policy-gate"));
    assert.ok(!slugs.includes("polymarket-feed"));
  });

  it("formatEditScopeHint tells agent to skip policy-gate for order/threshold edits", () => {
    const hint = formatEditScopeHint("set order size to $2 and threshold to 0.35");
    assert.match(hint, /polymarket-place-market/);
    assert.match(hint, /threshold/);
    assert.match(hint, /Do NOT patch policy-gate/);
    assert.match(hint, /inherit \| override/);
  });
});
