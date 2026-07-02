import { z } from "zod";
import { canvasGraphSchema } from "./canvas-graph.schema.js";
import { arePortsCompatible } from "./port-compatibility.js";
import type { CanvasGraph } from "./canvas-graph.types.js";
import { validateNodeConfig } from "./node-schemas/index.js";

export type CanvasGraphValidationError = {
  path: string;
  message: string;
};

export type CanvasGraphValidationResult =
  | { ok: true }
  | { ok: false; errors: CanvasGraphValidationError[] };

function pushError(
  errors: CanvasGraphValidationError[],
  path: string,
  message: string,
): void {
  errors.push({ path, message });
}

export function validateCanvasGraph(graph: CanvasGraph): CanvasGraphValidationResult {
  const errors: CanvasGraphValidationError[] = [];

  const parsed = canvasGraphSchema.safeParse(graph);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      pushError(errors, issue.path.join(".") || "graph", issue.message);
    }
    return { ok: false, errors };
  }

  const { nodes, edges } = parsed.data;

  const nodeIds = new Set<string>();
  for (const node of nodes) {
    if (nodeIds.has(node.id)) {
      pushError(errors, `nodes.${node.id}`, "Duplicate node id");
    } else {
      nodeIds.add(node.id);
    }

    const configResult = validateNodeConfig(node.type, node.config);
    if (!configResult.ok) {
      for (const configError of configResult.errors) {
        pushError(errors, `nodes.${node.id}.config.${configError.path}`, configError.message);
      }
    }
  }

  const edgeIds = new Set<string>();
  for (const edge of edges) {
    if (edgeIds.has(edge.id)) {
      pushError(errors, `edges.${edge.id}`, "Duplicate edge id");
    } else {
      edgeIds.add(edge.id);
    }

    if (!nodeIds.has(edge.source.node_id)) {
      pushError(
        errors,
        `edges.${edge.id}.source.node_id`,
        `Unknown source node "${edge.source.node_id}"`,
      );
    }

    if (!nodeIds.has(edge.target.node_id)) {
      pushError(
        errors,
        `edges.${edge.id}.target.node_id`,
        `Unknown target node "${edge.target.node_id}"`,
      );
    }

    if (edge.source.node_id === edge.target.node_id) {
      pushError(errors, `edges.${edge.id}`, "Self-loop edges are not allowed");
    }

    if (!arePortsCompatible(edge.source.port, edge.target.port)) {
      pushError(
        errors,
        `edges.${edge.id}`,
        `Incompatible ports: ${edge.source.port} → ${edge.target.port}`,
      );
    }
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  return { ok: true };
}

/** Parse unknown JSON into a validated graph (throws ZodError on schema failure). */
export function parseCanvasGraph(input: unknown): CanvasGraph {
  return canvasGraphSchema.parse(input);
}

/** Safe parse helper returning Zod issues when schema fails. */
export function safeParseCanvasGraph(input: unknown): z.SafeParseReturnType<unknown, CanvasGraph> {
  return canvasGraphSchema.safeParse(input);
}
