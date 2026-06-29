import type { CanvasEdge, CanvasNodeType, PortKind } from "../graph/canvas-graph.types.js";
import type { CanvasPolicy } from "../policy/canvas-policy.types.js";

export type CompileError = {
  path: string;
  message: string;
  code: string;
};

export type PolicyBindingWarning = {
  node_id: string;
  node_type: CanvasNodeType;
  code: string;
  message: string;
};

export type CompiledWorkflowEdge = {
  id: string;
  source: { node_id: string; port: PortKind };
  target: { node_id: string; port: PortKind };
};

export type CompiledWorkflowNode = {
  id: string;
  type: CanvasNodeType;
  /** Canonical type after alias resolution (e.g. place_order → polymarket_place_limit). */
  resolved_type: CanvasNodeType;
  config: Record<string, unknown>;
  meta?: { label?: string; builder_note?: string };
  /** Incoming edges grouped by target port. */
  inputs: CompiledWorkflowEdge[];
  /** Outgoing edges grouped by source port. */
  outputs: CompiledWorkflowEdge[];
};

export type CompiledWorkflow = {
  workflow_id: string;
  revision: number;
  compiled_at: string;
  compiled_hash: string;
  entry_node_ids: string[];
  execution_order: string[];
  nodes: CompiledWorkflowNode[];
  policy: CanvasPolicy;
  policy_warnings: PolicyBindingWarning[];
};
