import dagre from "@dagrejs/dagre";
import type { Edge } from "@xyflow/react";
import type { RichNode } from "./canvas-nodes";

/** Fallback sizes when a node hasn't been measured yet. */
const DEFAULT_WIDTH = 120;
const DEFAULT_HEIGHT = 96;

function nodeSize(node: RichNode): { width: number; height: number } {
  return {
    width: node.measured?.width ?? node.width ?? DEFAULT_WIDTH,
    height: node.measured?.height ?? node.height ?? DEFAULT_HEIGHT,
  };
}

/**
 * Dagre auto-layout (https://reactflow.dev/examples/layout/horizontal).
 * Arranges nodes left→right (or top→bottom) by graph rank so edges stop
 * overlapping. Uses each node's measured size so spacing is accurate.
 */
export function getLayoutedElements(
  nodes: RichNode[],
  edges: Edge[],
  direction: "LR" | "TB" = "LR",
): RichNode[] {
  if (nodes.length === 0) return nodes;

  const graph = new dagre.graphlib.Graph();
  graph.setDefaultEdgeLabel(() => ({}));
  graph.setGraph({
    rankdir: direction,
    ranksep: 140, // gap between columns/rows
    nodesep: 56, // gap between siblings
    marginx: 40,
    marginy: 40,
  });

  for (const node of nodes) {
    const { width, height } = nodeSize(node);
    graph.setNode(node.id, { width, height });
  }
  for (const edge of edges) {
    if (graph.hasNode(edge.source) && graph.hasNode(edge.target)) {
      graph.setEdge(edge.source, edge.target);
    }
  }

  dagre.layout(graph);

  return nodes.map((node) => {
    const pos = graph.node(node.id);
    if (!pos) return node;
    const { width, height } = nodeSize(node);
    // Dagre returns the node centre — React Flow wants the top-left corner.
    return {
      ...node,
      position: { x: pos.x - width / 2, y: pos.y - height / 2 },
    };
  });
}
