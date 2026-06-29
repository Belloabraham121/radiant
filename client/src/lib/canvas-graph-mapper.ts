import type { Edge, Node } from "@xyflow/react";
import type {
  CanvasBuildStreamEvent,
  CanvasGraphEdge,
  CanvasGraphNode,
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

export function applyBuildStreamEvent(
  event: CanvasBuildStreamEvent,
  nodes: RichNode[],
  edges: Edge[],
  mode: "build" | "dry" | "live",
): BuildGraphPatchResult {
  let focusNodeId: string | undefined;
  let nextNodes = nodes;
  let nextEdges = edges;

  switch (event.event) {
    case "workflow.node.add": {
      const flowNode = canvasNodeToFlowNode(event.data.node);
      nextNodes = [...nodes, flowNode];
      break;
    }
    case "workflow.node.update": {
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

  return { nodes: nextNodes, edges: nextEdges, focusNodeId };
}
