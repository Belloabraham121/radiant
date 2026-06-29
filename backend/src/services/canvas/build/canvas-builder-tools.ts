import { randomUUID } from "node:crypto";
import { z } from "zod";
import { AppError } from "../../../errors/app-error.js";
import {
  emitWorkflowBuildComplete,
  emitWorkflowEdgeAdd,
  emitWorkflowNodeAdd,
  emitWorkflowNodeFocus,
  emitWorkflowNodePatch,
  emitWorkflowNodeUpdate,
} from "./canvas-build-progress-context.js";
import { applyJsonPatch } from "./apply-json-patch.js";
import type { JsonPatchOperation } from "./canvas-build-progress.types.js";
import type { CanvasEdge, CanvasGraph, CanvasNode } from "../graph/canvas-graph.types.js";
import {
  BUILDER_FOCUS_NODE_TYPES,
  BUILDER_V1_NODE_SLUGS,
  isBuilderV1Slug,
  slugToNodeType,
} from "../graph/node-slug-map.js";
import {
  formatPortHintForSlug,
  getPostAddNodeWiringHints,
  NODE_PORT_PROFILES,
} from "./builder-port-catalog.js";
import { arePortsCompatible, formatIncompatiblePortsMessage } from "../graph/port-compatibility.js";
import { validateCanvasGraph } from "../graph/validate-graph.js";
import { persistCoherentGraphPatch, markWorkflowDryRunReady } from "../canvas-workflow.service.js";
import { searchPolymarketMarkets } from "../adapters/polymarket/polymarket-market-discovery.service.js";

const addNodeArgsSchema = z.object({
  slug: z.string().min(1),
  label: z.string().optional(),
  config: z.record(z.unknown()).optional(),
  position: z
    .object({
      x: z.number(),
      y: z.number(),
    })
    .optional(),
});

const patchNodeArgsSchema = z.object({
  node_id: z.string().uuid(),
  patch: z.record(z.unknown()).optional(),
  json_patch: z
    .array(
      z.object({
        op: z.enum(["add", "remove", "replace", "move", "copy", "test"]),
        path: z.string(),
        value: z.unknown().optional(),
        from: z.string().optional(),
      }),
    )
    .optional(),
});

const addEdgeArgsSchema = z.object({
  source_node_id: z.string().uuid(),
  source_port: z.enum(["trigger", "signal", "market", "order_intent", "data"]),
  target_node_id: z.string().uuid(),
  target_port: z.enum(["trigger", "signal", "market", "order_intent", "data"]),
});

const completeArgsSchema = z.object({
  summary: z.string().min(1).max(2000),
  warnings: z.array(z.string()).optional(),
});

const searchPolymarketMarketsArgsSchema = z.object({
  q: z.string().min(1).max(200),
  category: z.enum(["sports", "politics", "crypto"]).optional(),
  tag: z.string().trim().optional(),
  limit: z.number().int().min(1).max(10).optional(),
});

export type BuilderGraphState = {
  workflowId: string;
  revision: number;
  graph: CanvasGraph;
};

export type BuilderToolResult = {
  ok: true;
  message: string;
  completed?: boolean;
  revision?: number;
};

function findNode(graph: CanvasGraph, nodeId: string): CanvasNode | undefined {
  return graph.nodes.find((n) => n.id === nodeId);
}

function defaultPosition(graph: CanvasGraph): { x: number; y: number } {
  const count = graph.nodes.length;
  const col = Math.floor(count / 4);
  const row = count % 4;
  return { x: col * 320 + 40, y: row * 180 + 80 };
}

async function persistGraph(state: BuilderGraphState): Promise<number> {
  const validation = validateCanvasGraph(state.graph);
  if (!validation.ok) {
    throw new AppError(400, "GRAPH_VALIDATION_ERROR", "Builder produced an invalid graph.", {
      errors: validation.errors,
    });
  }
  const revision = await persistCoherentGraphPatch(
    state.workflowId,
    state.revision,
    state.graph,
  );
  state.revision = revision;
  return revision;
}

export async function builderAddNode(
  state: BuilderGraphState,
  rawArgs: unknown,
): Promise<BuilderToolResult> {
  const args = addNodeArgsSchema.parse(rawArgs);
  if (!isBuilderV1Slug(args.slug)) {
    throw new AppError(
      400,
      "UNKNOWN_NODE_SLUG",
      `Unknown node slug "${args.slug}". Use one of: ${BUILDER_V1_NODE_SLUGS.join(", ")}`,
    );
  }
  const nodeType = slugToNodeType(args.slug);
  if (!nodeType) {
    throw new AppError(400, "UNKNOWN_NODE_SLUG", `Cannot resolve slug "${args.slug}".`);
  }

  const node: CanvasNode = {
    id: randomUUID(),
    type: nodeType,
    position: args.position ?? defaultPosition(state.graph),
    config: args.config ?? {},
    meta: args.label ? { label: args.label } : undefined,
  };

  state.graph.nodes.push(node);
  emitWorkflowNodeAdd(node);
  const revision = await persistGraph(state);

  if (BUILDER_FOCUS_NODE_TYPES.has(nodeType)) {
    emitWorkflowNodeFocus(node.id, "needs_config");
  }

  const wiringHints = getPostAddNodeWiringHints(args.slug, state.graph);

  return {
    ok: true,
    message: `Added ${args.slug} node ${node.id} (${formatPortHintForSlug(args.slug)}). Next: add_edge to connect it.${wiringHints}`,
    revision,
  };
}

export async function builderPatchNode(
  state: BuilderGraphState,
  rawArgs: unknown,
): Promise<BuilderToolResult> {
  const args = patchNodeArgsSchema.parse(rawArgs);
  const existing = findNode(state.graph, args.node_id);
  if (!existing) {
    throw new AppError(404, "NODE_NOT_FOUND", `Node ${args.node_id} not found.`);
  }

  if (args.json_patch && args.json_patch.length > 0) {
    const patchedConfig = applyJsonPatch(
      { config: existing.config },
      args.json_patch as JsonPatchOperation[],
    );
    existing.config = patchedConfig.config as Record<string, unknown>;
    emitWorkflowNodePatch(args.node_id, args.json_patch as JsonPatchOperation[]);
  }

  if (args.patch) {
    if (args.patch.config && typeof args.patch.config === "object") {
      existing.config = {
        ...existing.config,
        ...(args.patch.config as Record<string, unknown>),
      };
    }
    if (args.patch.position && typeof args.patch.position === "object") {
      const pos = args.patch.position as { x?: number; y?: number };
      existing.position = {
        x: pos.x ?? existing.position.x,
        y: pos.y ?? existing.position.y,
      };
    }
    if (typeof args.patch.meta === "object" && args.patch.meta !== null) {
      existing.meta = {
        ...existing.meta,
        ...(args.patch.meta as CanvasNode["meta"]),
      };
    }
    emitWorkflowNodeUpdate(args.node_id, args.patch as Partial<CanvasNode>);
  }

  const revision = await persistGraph(state);
  return {
    ok: true,
    message: `Patched node ${args.node_id}`,
    revision,
  };
}

export async function builderAddEdge(
  state: BuilderGraphState,
  rawArgs: unknown,
): Promise<BuilderToolResult> {
  const args = addEdgeArgsSchema.parse(rawArgs);
  const sourceNode = findNode(state.graph, args.source_node_id);
  const targetNode = findNode(state.graph, args.target_node_id);
  if (!sourceNode || !targetNode) {
    throw new AppError(404, "NODE_NOT_FOUND", "Source or target node not found.");
  }
  if (!arePortsCompatible(args.source_port, args.target_port)) {
    const targetProfile = NODE_PORT_PROFILES[targetNode.type];
    throw new AppError(
      400,
      "INCOMPATIBLE_PORTS",
      formatIncompatiblePortsMessage(args.source_port, args.target_port, targetProfile.in),
    );
  }

  const edge: CanvasEdge = {
    id: randomUUID(),
    source: { node_id: args.source_node_id, port: args.source_port },
    target: { node_id: args.target_node_id, port: args.target_port },
  };

  state.graph.edges.push(edge);
  emitWorkflowEdgeAdd(edge);
  const revision = await persistGraph(state);

  return {
    ok: true,
    message: `Added edge ${edge.id}`,
    revision,
  };
}

export async function builderComplete(
  state: BuilderGraphState,
  rawArgs: unknown,
): Promise<BuilderToolResult> {
  const args = completeArgsSchema.parse(rawArgs);
  await markWorkflowDryRunReady(state.workflowId);
  emitWorkflowBuildComplete(state.revision, args.summary, args.warnings ?? []);
  return {
    ok: true,
    message: "Build complete",
    completed: true,
    revision: state.revision,
  };
}

export async function builderSearchPolymarketMarkets(
  _state: BuilderGraphState,
  rawArgs: unknown,
): Promise<BuilderToolResult> {
  const args = searchPolymarketMarketsArgsSchema.parse(rawArgs);
  const result = await searchPolymarketMarkets({
    q: args.q,
    category: args.category,
    tag: args.tag,
    limit: args.limit ?? 5,
  });

  const lines = result.markets.map((m) => {
    const tokens = m.clob_token_ids.join(", ") || "no tokens";
    const tags = m.tags.slice(0, 4).join(", ") || "—";
    return `- id=${m.id} slug=${m.slug} question="${m.question}" tags=[${tags}] clob_token_ids=[${tokens}]`;
  });

  return {
    ok: true,
    message: lines.length
      ? `Polymarket markets:\n${lines.join("\n")}`
      : "No Polymarket markets matched that query.",
  };
}

export const CANVAS_BUILDER_TOOL_DEFINITIONS = [
  {
    type: "function" as const,
    function: {
      name: "add_node",
      description: "Add a v1 workflow node to the canvas graph.",
      parameters: {
        type: "object",
        properties: {
          slug: {
            type: "string",
            enum: BUILDER_V1_NODE_SLUGS,
            description: "Node catalog slug (kebab-case).",
          },
          label: { type: "string", description: "Optional display label." },
          config: { type: "object", description: "Initial node config fields." },
          position: {
            type: "object",
            properties: { x: { type: "number" }, y: { type: "number" } },
          },
        },
        required: ["slug"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "patch_node",
      description: "Update an existing node config, position, or metadata.",
      parameters: {
        type: "object",
        properties: {
          node_id: { type: "string", format: "uuid" },
          patch: { type: "object" },
          json_patch: {
            type: "array",
            items: {
              type: "object",
              properties: {
                op: { type: "string" },
                path: { type: "string" },
                value: {},
                from: { type: "string" },
              },
              required: ["op", "path"],
            },
          },
        },
        required: ["node_id"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "add_edge",
      description:
        "REQUIRED: Connect two nodes. Use UUIDs from add_node. Port rules: trigger→trigger for control flow; data→data for feeds→logic; market→market for PM context; order_intent→order_intent for trade intents; action.data→workflow-stop.signal to finish after place-order nodes (never action.data→stop.trigger). Call once per link in the workflow chain.",
      parameters: {
        type: "object",
        properties: {
          source_node_id: { type: "string", format: "uuid" },
          source_port: {
            type: "string",
            enum: ["trigger", "signal", "market", "order_intent", "data"],
          },
          target_node_id: { type: "string", format: "uuid" },
          target_port: {
            type: "string",
            enum: ["trigger", "signal", "market", "order_intent", "data"],
          },
        },
        required: ["source_node_id", "source_port", "target_node_id", "target_port"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "search_polymarket_markets",
      description:
        "Search Polymarket markets by name/category to resolve clob token ids before patch_node.",
      parameters: {
        type: "object",
        properties: {
          q: { type: "string", description: "Market search query (team, event, question text)." },
          category: {
            type: "string",
            enum: ["sports", "politics", "crypto"],
            description: "Optional top-level category filter.",
          },
          tag: {
            type: "string",
            description: "Optional Gamma tag slug (e.g. nfl, nba) for sports sub-filters.",
          },
          limit: { type: "number", description: "Max results (1-10, default 5)." },
        },
        required: ["q"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "complete",
      description: "Signal that the workflow build is finished.",
      parameters: {
        type: "object",
        properties: {
          summary: { type: "string" },
          warnings: { type: "array", items: { type: "string" } },
        },
        required: ["summary"],
      },
    },
  },
];

export async function runBuilderTool(
  name: string,
  args: unknown,
  state: BuilderGraphState,
): Promise<BuilderToolResult> {
  switch (name) {
    case "add_node":
      return builderAddNode(state, args);
    case "patch_node":
      return builderPatchNode(state, args);
    case "add_edge":
      return builderAddEdge(state, args);
    case "search_polymarket_markets":
      return builderSearchPolymarketMarkets(state, args);
    case "complete":
      return builderComplete(state, args);
    default:
      throw new AppError(400, "UNKNOWN_BUILDER_TOOL", `Unknown builder tool: ${name}`);
  }
}
