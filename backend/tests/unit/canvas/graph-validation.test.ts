import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { describe, it } from "node:test";
import type { CanvasGraph } from "../../../src/services/canvas/graph/canvas-graph.types.js";
import { validateCanvasGraph } from "../../../src/services/canvas/graph/validate-graph.js";

function makeNode(
  id: string,
  type: "workflow_start" | "if_condition" | "lifi_swap" = "workflow_start",
) {
  return {
    id,
    type,
    position: { x: 0, y: 0 },
    config: {},
  };
}

function makeEdge(
  id: string,
  sourceId: string,
  targetId: string,
  sourcePort: "trigger" = "trigger",
  targetPort: "trigger" = "trigger",
) {
  return {
    id,
    source: { node_id: sourceId, port: sourcePort },
    target: { node_id: targetId, port: targetPort },
  };
}

describe("canvas graph validation", () => {
  it("accepts a valid minimal graph", () => {
    const startId = randomUUID();
    const logicId = randomUUID();
    const graph: CanvasGraph = {
      nodes: [makeNode(startId), makeNode(logicId, "if_condition")],
      edges: [makeEdge(randomUUID(), startId, logicId)],
    };

    const result = validateCanvasGraph(graph);
    assert.equal(result.ok, true);
  });

  it("rejects duplicate node ids", () => {
    const nodeId = randomUUID();
    const graph: CanvasGraph = {
      nodes: [makeNode(nodeId), makeNode(nodeId, "if_condition")],
      edges: [],
    };

    const result = validateCanvasGraph(graph);
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.ok(result.errors.some((e) => e.message.includes("Duplicate node id")));
    }
  });

  it("rejects edges referencing unknown nodes", () => {
    const startId = randomUUID();
    const missingId = randomUUID();
    const graph: CanvasGraph = {
      nodes: [makeNode(startId)],
      edges: [makeEdge(randomUUID(), startId, missingId)],
    };

    const result = validateCanvasGraph(graph);
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.ok(
        result.errors.some((e) => e.path.includes("target.node_id") && e.message.includes(missingId)),
      );
    }
  });

  it("rejects incompatible port connections", () => {
    const startId = randomUUID();
    const swapId = randomUUID();
    const graph: CanvasGraph = {
      nodes: [makeNode(startId), makeNode(swapId, "lifi_swap")],
      edges: [
        {
          id: randomUUID(),
          source: { node_id: startId, port: "trigger" },
          target: { node_id: swapId, port: "order_intent" },
        },
      ],
    };

    const result = validateCanvasGraph(graph);
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.ok(result.errors.some((e) => e.message.includes("Incompatible ports")));
    }
  });
});
