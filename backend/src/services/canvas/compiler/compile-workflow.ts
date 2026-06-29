import { createHash } from "node:crypto";
import type { CanvasEdge, CanvasGraph, CanvasNode, CanvasNodeType } from "../graph/canvas-graph.types.js";
import { validateCanvasGraph } from "../graph/validate-graph.js";
import type { CanvasPolicy } from "../policy/canvas-policy.types.js";
import type {
  CompileError,
  CompiledWorkflow,
  CompiledWorkflowEdge,
  CompiledWorkflowNode,
  PolicyBindingWarning,
} from "./compiled-workflow.types.js";

const ENTRY_NODE_TYPES = new Set<CanvasNodeType>(["workflow_start", "schedule_cron"]);

const ACTION_NODE_TYPES = new Set<CanvasNodeType>([
  "place_order",
  "polymarket_place_limit",
  "polymarket_place_market",
  "polymarket_cancel_order",
  "lifi_swap",
  "lifi_bridge",
  "lifi_quote",
  "copy_trade",
  "swap_bridge",
]);

export type CompileWorkflowInput = {
  workflowId: string;
  revision: number;
  graph: CanvasGraph;
  policy: CanvasPolicy;
  /** When true, policy binding warnings become compile errors (Live deploy). */
  enforcePolicyHard?: boolean;
};

export type CompileWorkflowResult =
  | { ok: true; compiled: CompiledWorkflow }
  | { ok: false; errors: CompileError[] };

function resolveNodeType(node: CanvasNode): CanvasNodeType {
  const config = node.config;
  switch (node.type) {
    case "place_order": {
      const orderType = config.order_type ?? config.side;
      if (orderType === "market" || config.market_order === true) {
        return "polymarket_place_market";
      }
      return "polymarket_place_limit";
    }
    case "swap_bridge":
      return "lifi_swap";
    default:
      return node.type;
  }
}

function topologicalSort(nodeIds: string[], edges: CompiledWorkflowEdge[]): string[] | null {
  const inDegree = new Map<string, number>();
  const adj = new Map<string, string[]>();

  for (const id of nodeIds) {
    inDegree.set(id, 0);
    adj.set(id, []);
  }

  for (const edge of edges) {
    const src = edge.source.node_id;
    const tgt = edge.target.node_id;
    if (!inDegree.has(src) || !inDegree.has(tgt)) continue;
    adj.get(src)!.push(tgt);
    inDegree.set(tgt, (inDegree.get(tgt) ?? 0) + 1);
  }

  const queue = [...nodeIds].filter((id) => (inDegree.get(id) ?? 0) === 0);
  const order: string[] = [];

  while (queue.length > 0) {
    const current = queue.shift()!;
    order.push(current);
    for (const next of adj.get(current) ?? []) {
      const deg = (inDegree.get(next) ?? 0) - 1;
      inDegree.set(next, deg);
      if (deg === 0) queue.push(next);
    }
  }

  if (order.length !== nodeIds.length) {
    return null;
  }
  return order;
}

function findConnectedComponents(
  nodeIds: string[],
  edges: CanvasEdge[],
): string[][] {
  const adj = new Map<string, Set<string>>();
  for (const id of nodeIds) adj.set(id, new Set());
  for (const edge of edges) {
    adj.get(edge.source.node_id)?.add(edge.target.node_id);
    adj.get(edge.target.node_id)?.add(edge.source.node_id);
  }

  const visited = new Set<string>();
  const components: string[][] = [];

  for (const id of nodeIds) {
    if (visited.has(id)) continue;
    const stack = [id];
    const component: string[] = [];
    visited.add(id);
    while (stack.length > 0) {
      const current = stack.pop()!;
      component.push(current);
      for (const neighbor of adj.get(current) ?? []) {
        if (!visited.has(neighbor)) {
          visited.add(neighbor);
          stack.push(neighbor);
        }
      }
    }
    components.push(component);
  }

  return components;
}

function bindPolicyWarnings(
  nodes: CompiledWorkflowNode[],
  policy: CanvasPolicy,
): PolicyBindingWarning[] {
  const warnings: PolicyBindingWarning[] = [];

  if (policy.kill_switch) {
    warnings.push({
      node_id: "*",
      node_type: "workflow_start",
      code: "POLICY_KILL_SWITCH",
      message: "Policy kill switch is enabled — Live runs would halt immediately.",
    });
  }

  for (const node of nodes) {
    const resolved = node.resolved_type;
    if (!ACTION_NODE_TYPES.has(resolved)) continue;

    if (!policy.allowed_actions.includes(resolved)) {
      warnings.push({
        node_id: node.id,
        node_type: resolved,
        code: "POLICY_ACTION_NOT_ALLOWED",
        message: `Action "${resolved}" is not in policy allowed_actions — would be denied in Live.`,
      });
    }

    const spendUsd = typeof node.config.est_usd === "number" ? node.config.est_usd : null;
    if (spendUsd != null && spendUsd > policy.max_single_action_usd) {
      warnings.push({
        node_id: node.id,
        node_type: resolved,
        code: "POLICY_SINGLE_ACTION_CAP",
        message: `Estimated $${spendUsd} exceeds max_single_action_usd ($${policy.max_single_action_usd}).`,
      });
    }
  }

  for (const rule of policy.forbidden_transfers) {
    const parts = [rule.from_chain, rule.to_chain, rule.token_symbol].filter(Boolean);
    if (parts.length > 0) {
      warnings.push({
        node_id: "*",
        node_type: "lifi_bridge",
        code: "POLICY_FORBIDDEN_TRANSFER",
        message: `Forbidden transfer rule: ${parts.join(" / ")}`,
      });
    }
  }

  return warnings;
}

function hashCompiled(compiled: Omit<CompiledWorkflow, "compiled_hash">): string {
  const payload = JSON.stringify({
    workflow_id: compiled.workflow_id,
    revision: compiled.revision,
    entry_node_ids: compiled.entry_node_ids,
    execution_order: compiled.execution_order,
    nodes: compiled.nodes.map((n) => ({
      id: n.id,
      resolved_type: n.resolved_type,
      config: n.config,
    })),
    policy_version: compiled.policy.policy_version,
  });
  return createHash("sha256").update(payload).digest("hex").slice(0, 16);
}

export function compileWorkflow(input: CompileWorkflowInput): CompileWorkflowResult {
  const errors: CompileError[] = [];

  const validation = validateCanvasGraph(input.graph);
  if (!validation.ok) {
    return {
      ok: false,
      errors: validation.errors.map((e) => ({
        path: e.path,
        message: e.message,
        code: "GRAPH_VALIDATION",
      })),
    };
  }

  const { nodes, edges } = input.graph;
  const nodeById = new Map(nodes.map((n) => [n.id, n]));

  const compiledEdges: CompiledWorkflowEdge[] = edges.map((e) => ({
    id: e.id,
    source: e.source,
    target: e.target,
  }));

  const compiledNodes: CompiledWorkflowNode[] = nodes.map((node) => ({
    id: node.id,
    type: node.type,
    resolved_type: resolveNodeType(node),
    config: node.config,
    meta: node.meta,
    inputs: compiledEdges.filter((e) => e.target.node_id === node.id),
    outputs: compiledEdges.filter((e) => e.source.node_id === node.id),
  }));

  const nodeIds = nodes.map((n) => n.id);
  const executionOrder = topologicalSort(nodeIds, compiledEdges);
  if (!executionOrder) {
    errors.push({
      path: "graph",
      message: "Workflow graph contains a cycle — DAG required.",
      code: "GRAPH_CYCLE",
    });
  }

  const components = findConnectedComponents(nodeIds, edges);
  const entryNodeIds: string[] = [];

  for (const component of components) {
    const entries = component.filter((id) => {
      const node = nodeById.get(id);
      return node && ENTRY_NODE_TYPES.has(node.type);
    });
    if (entries.length === 0 && component.length > 0) {
      errors.push({
        path: `nodes.${component[0]}`,
        message: "Connected component missing workflow_start or schedule_cron entry.",
        code: "MISSING_ENTRY",
      });
    } else {
      entryNodeIds.push(...entries);
    }
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  const policy_warnings = bindPolicyWarnings(compiledNodes, input.policy);

  if (input.enforcePolicyHard) {
    for (const warning of policy_warnings) {
      if (
        warning.code === "POLICY_KILL_SWITCH" ||
        warning.code === "POLICY_ACTION_NOT_ALLOWED" ||
        warning.code === "POLICY_SINGLE_ACTION_CAP"
      ) {
        errors.push({
          path: `nodes.${warning.node_id}`,
          message: warning.message,
          code: warning.code,
        });
      }
    }
    if (errors.length > 0) {
      return { ok: false, errors };
    }
  }

  const withoutHash: Omit<CompiledWorkflow, "compiled_hash"> = {
    workflow_id: input.workflowId,
    revision: input.revision,
    compiled_at: new Date().toISOString(),
    entry_node_ids: entryNodeIds,
    execution_order: executionOrder!,
    nodes: compiledNodes,
    policy: input.policy,
    policy_warnings,
  };

  const compiled: CompiledWorkflow = {
    ...withoutHash,
    compiled_hash: hashCompiled(withoutHash),
  };

  return { ok: true, compiled };
}
