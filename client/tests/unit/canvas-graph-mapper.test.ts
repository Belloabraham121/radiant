import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Edge } from "@xyflow/react";
import {
  applyBuildStreamEvent,
  removeNodesFromFlowGraph,
} from "../../src/lib/canvas-graph-mapper";
import type { RichNode } from "../../src/components/canvas/canvas-nodes";

const sampleNodes: RichNode[] = [
  {
    id: "a",
    type: "rich",
    position: { x: 0, y: 0 },
    data: {
      category: "control",
      icon: "Play",
      title: "Start",
      preview: "none",
      config: [],
      inputs: [],
      outputs: [],
    },
  },
  {
    id: "b",
    type: "rich",
    position: { x: 100, y: 0 },
    data: {
      category: "action",
      icon: "Zap",
      title: "Swap",
      preview: "none",
      config: [],
      inputs: [],
      outputs: [],
    },
  },
];

const sampleEdges: Edge[] = [
  {
    id: "e1",
    source: "a",
    target: "b",
    sourceHandle: "out-trigger",
    targetHandle: "in-data",
  },
];

describe("removeNodesFromFlowGraph", () => {
  it("removes the node and any connected edges", () => {
    const result = removeNodesFromFlowGraph(["b"], sampleNodes, sampleEdges);
    assert.equal(result.nodes.length, 1);
    assert.equal(result.nodes[0]?.id, "a");
    assert.equal(result.edges.length, 0);
  });

  it("is a no-op when no ids match", () => {
    const result = removeNodesFromFlowGraph(["missing"], sampleNodes, sampleEdges);
    assert.equal(result.nodes.length, 2);
    assert.equal(result.edges.length, 1);
  });
});

describe("applyBuildStreamEvent deleted-node tombstones", () => {
  it("ignores workflow.node.add for tombstoned ids", () => {
    const deleted = new Set(["resurrect-me"]);
    const result = applyBuildStreamEvent(
      {
        event: "workflow.node.add",
        data: {
          node: {
            id: "resurrect-me",
            type: "workflow_start",
            position: { x: 0, y: 0 },
            config: {},
          },
        },
      },
      sampleNodes,
      sampleEdges,
      "build",
      deleted,
    );
    assert.equal(result.nodes.length, 2);
    assert.equal(result.edges.length, 1);
  });
});
