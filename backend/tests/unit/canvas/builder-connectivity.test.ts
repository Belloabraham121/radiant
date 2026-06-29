import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { describe, it } from "node:test";
import {
  buildBuilderSystemPrompt,
  formatPortHintForSlug,
  POLYMARKET_SPORTS_AUTO_TRADE_EDGES,
  validateBuilderGraphConnectivity,
} from "../../../src/services/canvas/build/builder-port-catalog.js";
import { arePortsCompatible } from "../../../src/services/canvas/graph/port-compatibility.js";
import { slugToNodeType } from "../../../src/services/canvas/graph/node-slug-map.js";
import type { CanvasGraph } from "../../../src/services/canvas/graph/canvas-graph.types.js";

describe("builder port catalog", () => {
  it("includes port hints for v1 slugs", () => {
    const hint = formatPortHintForSlug("workflow-start");
    assert.match(hint, /out:\[trigger\]/);
    assert.match(hint, /in:\[—\]/);
  });

  it("system prompt stresses add_edge and port rules", () => {
    const prompt = buildBuilderSystemPrompt();
    assert.match(prompt, /MUST connect nodes with add_edge/);
    assert.match(prompt, /trigger → trigger/);
    assert.match(prompt, /workflow-start/);
    assert.match(prompt, /polymarket-place-market\.data → workflow-stop\.signal/);
    assert.match(prompt, /polymarket-feed is a source \(no trigger input\)/);
  });

  it("Polymarket sports auto-trading edges are port-compatible", () => {
    for (const edge of POLYMARKET_SPORTS_AUTO_TRADE_EDGES) {
      assert.equal(
        arePortsCompatible(edge.sourcePort, edge.targetPort),
        true,
        `${edge.sourceSlug}.${edge.sourcePort} → ${edge.targetSlug}.${edge.targetPort}`,
      );
    }

    // Common Builder mistake on the 7th edge: action completion wired to stop.trigger
    assert.equal(
      arePortsCompatible("data", "trigger"),
      false,
      "action.data must not connect to workflow-stop.trigger",
    );
    assert.equal(
      arePortsCompatible("data", "signal"),
      true,
      "action.data should connect to workflow-stop.signal",
    );
  });

  it("accepts a connected Polymarket sports auto-trading graph", () => {
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
      nodes: Object.entries(ids).map(([slug, id]) => ({
        id,
        type: slugToNodeType(slug)!,
        position: { x: 0, y: 0 },
        config: {},
      })),
      edges: POLYMARKET_SPORTS_AUTO_TRADE_EDGES.map((spec) => ({
        id: randomUUID(),
        source: { node_id: ids[spec.sourceSlug], port: spec.sourcePort },
        target: { node_id: ids[spec.targetSlug], port: spec.targetPort },
      })),
    };

    assert.deepEqual(validateBuilderGraphConnectivity(graph), []);
  });

  it("rejects disconnected graphs", () => {
    const graph: CanvasGraph = {
      nodes: [
        {
          id: "a",
          type: "workflow_start",
          position: { x: 0, y: 0 },
          config: {},
        },
        {
          id: "b",
          type: "workflow_stop",
          position: { x: 100, y: 0 },
          config: {},
        },
      ],
      edges: [],
    };
    const issues = validateBuilderGraphConnectivity(graph);
    assert.ok(issues.some((i) => i.includes("zero edges")));
  });

  it("accepts a minimal connected chain", () => {
    const graph: CanvasGraph = {
      nodes: [
        {
          id: "a",
          type: "workflow_start",
          position: { x: 0, y: 0 },
          config: {},
        },
        {
          id: "b",
          type: "workflow_stop",
          position: { x: 100, y: 0 },
          config: {},
        },
      ],
      edges: [
        {
          id: "e1",
          source: { node_id: "a", port: "trigger" },
          target: { node_id: "b", port: "trigger" },
        },
      ],
    };
    assert.deepEqual(validateBuilderGraphConnectivity(graph), []);
  });
});
