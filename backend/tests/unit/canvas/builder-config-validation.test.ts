import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { describe, it } from "node:test";
import {
  formatConfigPatchHint,
  validateBuilderNodeConfig,
} from "../../../src/services/canvas/build/builder-config-catalog.js";
import { buildBuilderSystemPrompt } from "../../../src/services/canvas/build/builder-port-catalog.js";
import { slugToNodeType } from "../../../src/services/canvas/graph/node-slug-map.js";
import type { CanvasGraph } from "../../../src/services/canvas/graph/canvas-graph.types.js";

describe("builder config validation", () => {
  it("formatConfigPatchHint lists keys for configurable slugs", () => {
    const hint = formatConfigPatchHint("threshold");
    assert.match(hint, /metric, operator, value/);
    assert.match(hint, /patch_node/);
  });

  it("system prompt mandates config imputation and search_polymarket_markets", () => {
    const prompt = buildBuilderSystemPrompt();
    assert.match(prompt, /MANDATORY: Fill ALL node config/);
    assert.match(prompt, /search_polymarket_markets FIRST/);
    assert.match(prompt, /patch_node for EVERY node/);
    assert.match(prompt, /Edit mode \(existing graph/);
    assert.match(prompt, /policy-gate policy_mode accepts inherit \| override ONLY/);
    assert.match(prompt, /Do NOT patch policy-gate, ui-table, or polymarket-feed unless/);
    assert.doesNotMatch(prompt, /tell them to select the market in the node picker/);
  });

  it("rejects polymarket feed without asset_id or market", () => {
    const graph: CanvasGraph = {
      nodes: [
        {
          id: randomUUID(),
          type: "polymarket_feed",
          position: { x: 0, y: 0 },
          config: { outcome: "yes" },
        },
      ],
      edges: [],
    };
    const issues = validateBuilderNodeConfig(graph);
    assert.ok(issues.some((i) => i.includes("missing market config")));
  });

  it("rejects threshold without value", () => {
    const graph: CanvasGraph = {
      nodes: [
        {
          id: randomUUID(),
          type: "threshold",
          position: { x: 0, y: 0 },
          config: { metric: "mid", operator: "<" },
        },
      ],
      edges: [],
    };
    const issues = validateBuilderNodeConfig(graph);
    assert.ok(issues.some((i) => i.includes("missing threshold value")));
  });

  it("rejects place_market order without size", () => {
    const graph: CanvasGraph = {
      nodes: [
        {
          id: randomUUID(),
          type: "polymarket_place_market",
          position: { x: 0, y: 0 },
          config: { side: "buy", outcome: "yes" },
        },
      ],
      edges: [],
    };
    const issues = validateBuilderNodeConfig(graph);
    assert.ok(issues.some((i) => i.includes("missing order size")));
  });

  it("accepts a fully configured sports auto-trade graph", () => {
    const ids = Object.fromEntries(
      [
        "workflow-start",
        "polymarket-feed",
        "threshold",
        "workflow-approve",
        "policy-gate",
        "polymarket-place-market",
        "workflow-stop",
      ].map((slug) => [slug, randomUUID()]),
    ) as Record<string, string>;

    const graph: CanvasGraph = {
      nodes: [
        {
          id: ids["workflow-start"],
          type: slugToNodeType("workflow-start")!,
          position: { x: 0, y: 0 },
          config: {},
        },
        {
          id: ids["polymarket-feed"],
          type: slugToNodeType("polymarket-feed")!,
          position: { x: 0, y: 0 },
          config: {
            market: "Chiefs vs Bills",
            asset_id: "123456",
            outcome: "yes",
            depth: "5",
          },
        },
        {
          id: ids.threshold,
          type: slugToNodeType("threshold")!,
          position: { x: 0, y: 0 },
          config: { metric: "mid", operator: "<", value: 0.35 },
        },
        {
          id: ids["workflow-approve"],
          type: slugToNodeType("workflow-approve")!,
          position: { x: 0, y: 0 },
          config: { message: "Confirm trade" },
        },
        {
          id: ids["policy-gate"],
          type: slugToNodeType("policy-gate")!,
          position: { x: 0, y: 0 },
          config: {},
        },
        {
          id: ids["polymarket-place-market"],
          type: slugToNodeType("polymarket-place-market")!,
          position: { x: 0, y: 0 },
          config: { side: "buy", size: 50, outcome: "yes" },
        },
        {
          id: ids["workflow-stop"],
          type: slugToNodeType("workflow-stop")!,
          position: { x: 0, y: 0 },
          config: {},
        },
      ],
      edges: [],
    };

    assert.deepEqual(validateBuilderNodeConfig(graph), []);
  });
});
