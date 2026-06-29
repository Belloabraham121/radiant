import type { Edge, Node } from "@xyflow/react";
import type {
  CanvasBuildStreamEvent,
  CanvasGraphEdge,
  CanvasGraphNode,
  CanvasGraphPayload,
} from "@/lib/canvas-api";
import {
  NODE_CATALOG,
  nodeDataFromCatalog,
  type NodeCatalogEntry,
} from "@/components/canvas/node-catalog";
import type { ConfigValue, RichNode } from "@/components/canvas/canvas-nodes";
import { applyJsonPatchClient } from "@/lib/canvas-json-patch";

/** snake_case backend type → kebab-case catalog slug */
export function nodeTypeToCatalogSlug(nodeType: string): string {
  return nodeType.replace(/_/g, "-");
}

export function findCatalogEntry(nodeType: string): NodeCatalogEntry | undefined {
  const slug = nodeTypeToCatalogSlug(nodeType);
  return NODE_CATALOG.find((e) => e.slug === slug);
}

export function canvasNodeToFlowNode(node: CanvasGraphNode): RichNode {
  const entry = findCatalogEntry(node.type);
  const data = entry
    ? nodeDataFromCatalog(entry)
    : {
        category: "control" as const,
        icon: "Play",
        title: node.meta?.label ?? nodeTypeToCatalogSlug(node.type),
        preview: "none" as const,
        config: Object.entries(node.config).map(([label, value]) => ({
          label,
          value: String(value),
        })),
        inputs: [],
        outputs: [],
      };

  if (node.meta?.label) {
    data.title = node.meta.label;
  }

  if (Object.keys(node.config).length > 0) {
    const configValues = Object.fromEntries(
      Object.entries(node.config).map(([key, value]) => [key, value as ConfigValue]),
    );
    data.values = { ...(data.values ?? {}), ...configValues };
    data.config = Object.entries(node.config).map(([label, value]) => ({
      label,
      value: String(value),
    }));
  }

  const isChart = entry?.nodeType === "chart";
  return {
    id: node.id,
    type: entry?.nodeType ?? "rich",
    position: node.position,
    data,
    ...(isChart ? { width: node.size?.w ?? 400, height: node.size?.h ?? 280 } : {}),
  };
}

export function canvasGraphToFlow(
  nodes: CanvasGraphNode[],
  edges: CanvasGraphEdge[],
  mode: "build" | "dry" | "live",
): { nodes: RichNode[]; edges: Edge[] } {
  const flowNodes = nodes.map(canvasNodeToFlowNode);
  const flowEdges: Edge[] = edges.map((e) => ({
    id: e.id,
    source: e.source.node_id,
    target: e.target.node_id,
    sourceHandle: `out-${e.source.port}`,
    targetHandle: `in-${e.target.port}`,
    type: mode === "build" ? "step" : "animated",
    style: { stroke: "var(--hero-ink)", strokeWidth: 2.5 },
  }));
  return { nodes: flowNodes, edges: flowEdges };
}

/** Catalog slug → backend node type (subset used when persisting from the board). */
const CATALOG_SLUG_TO_NODE_TYPE: Record<string, string> = {
  "price-chart": "price_chart",
  "polymarket-market": "polymarket_feed",
  "polymarket-order": "place_order",
  swap: "lifi_swap",
  bridge: "lifi_bridge",
};

const CANVAS_PORT_KINDS = [
  "trigger",
  "signal",
  "market",
  "order_intent",
  "data",
] as const;

type CanvasPortKind = (typeof CANVAS_PORT_KINDS)[number];

function parsePortFromHandle(
  handle: string | null | undefined,
  direction: "in" | "out",
): CanvasPortKind {
  const prefix = direction === "out" ? "out-" : "in-";
  if (!handle?.startsWith(prefix)) return "data";
  const raw = handle.slice(prefix.length);
  return (CANVAS_PORT_KINDS as readonly string[]).includes(raw)
    ? (raw as CanvasPortKind)
    : "data";
}

export function flowEdgeToCanvasEdge(edge: Edge): CanvasGraphEdge {
  return {
    id: edge.id,
    source: {
      node_id: edge.source,
      port: parsePortFromHandle(edge.sourceHandle, "out"),
    },
    target: {
      node_id: edge.target,
      port: parsePortFromHandle(edge.targetHandle, "in"),
    },
  };
}

/** Remove a node and any edges connected to it. */
export function removeNodesFromFlowGraph(
  nodeIds: Iterable<string>,
  nodes: RichNode[],
  edges: Edge[],
): { nodes: RichNode[]; edges: Edge[] } {
  const removed = new Set(nodeIds);
  if (removed.size === 0) return { nodes, edges };
  return {
    nodes: nodes.filter((n) => !removed.has(n.id)),
    edges: edges.filter((e) => !removed.has(e.source) && !removed.has(e.target)),
  };
}

export function flowGraphToCanvasGraph(
  nodes: RichNode[],
  edges: Edge[],
  viewport?: CanvasGraphPayload["viewport"],
): CanvasGraphPayload {
  return {
    nodes: nodes.map((n) => flowNodeToCanvasNode(n)),
    edges: edges.map(flowEdgeToCanvasEdge),
    ...(viewport ? { viewport } : {}),
  };
}

export function flowNodeToCanvasNode(node: Node): CanvasGraphNode {
  const data = node.data as RichNode["data"];
  const entry = NODE_CATALOG.find((e) => e.title === data.title);
  const type = entry
    ? (CATALOG_SLUG_TO_NODE_TYPE[entry.slug] ?? entry.slug.replace(/-/g, "_"))
    : "custom_app_action";
  return {
    id: node.id,
    type,
    position: node.position,
    config: data.values ?? {},
    meta: { label: data.title },
  };
}

export type BuildGraphPatchResult = {
  nodes: RichNode[];
  edges: Edge[];
  focusNodeId?: string;
};

function withoutDeletedNodes(
  nodes: RichNode[],
  edges: Edge[],
  deletedNodeIds?: ReadonlySet<string>,
): { nodes: RichNode[]; edges: Edge[] } {
  if (!deletedNodeIds || deletedNodeIds.size === 0) return { nodes, edges };
  return removeNodesFromFlowGraph(deletedNodeIds, nodes, edges);
}

export function applyBuildStreamEvent(
  event: CanvasBuildStreamEvent,
  nodes: RichNode[],
  edges: Edge[],
  mode: "build" | "dry" | "live",
  deletedNodeIds?: ReadonlySet<string>,
): BuildGraphPatchResult {
  let focusNodeId: string | undefined;
  let nextNodes = nodes;
  let nextEdges = edges;

  switch (event.event) {
    case "workflow.node.add": {
      if (deletedNodeIds?.has(event.data.node.id)) {
        break;
      }
      const flowNode = canvasNodeToFlowNode(event.data.node);
      nextNodes = [...nodes, flowNode];
      break;
    }
    case "workflow.node.update": {
      if (deletedNodeIds?.has(event.data.node_id)) {
        break;
      }
      nextNodes = nodes.map((n) => {
        if (n.id !== event.data.node_id) return n;
        const patch = event.data.patch;
        const updated = { ...n, ...patch } as RichNode;
        if (patch.config) {
          updated.data = {
            ...n.data,
            values: {
              ...(n.data.values ?? {}),
              ...(patch.config as Record<string, ConfigValue>),
            },
          };
        }
        if (patch.meta?.label) {
          updated.data = { ...updated.data, title: patch.meta.label };
        }
        return updated;
      });
      break;
    }
    case "workflow.node.patch": {
      if (deletedNodeIds?.has(event.data.node_id)) {
        break;
      }
      nextNodes = nodes.map((n) => {
        if (n.id !== event.data.node_id) return n;
        const values = n.data.values ?? {};
        const patched = applyJsonPatchClient({ config: values }, event.data.json_patch);
        return {
          ...n,
          data: {
            ...n.data,
            values: patched.config as Record<string, ConfigValue>,
          },
        };
      });
      break;
    }
    case "workflow.edge.add": {
      const e = event.data.edge;
      nextEdges = [
        ...edges,
        {
          id: e.id,
          source: e.source.node_id,
          target: e.target.node_id,
          sourceHandle: `out-${e.source.port}`,
          targetHandle: `in-${e.target.port}`,
          type: mode === "build" ? "step" : "animated",
          style: { stroke: "var(--hero-ink)", strokeWidth: 2.5 },
        },
      ];
      break;
    }
    case "workflow.edge.remove":
      nextEdges = edges.filter((e) => e.id !== event.data.edge_id);
      break;
    case "workflow.node.focus":
      focusNodeId = event.data.node_id;
      break;
    default:
      break;
  }

  const filtered = withoutDeletedNodes(nextNodes, nextEdges, deletedNodeIds);
  return { nodes: filtered.nodes, edges: filtered.edges, focusNodeId };
}
