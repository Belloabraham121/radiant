import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { describe, it } from "node:test";
import { compileWorkflow } from "../../../src/services/canvas/compiler/compile-workflow.js";
import { createDefaultCanvasPolicy } from "../../../src/services/canvas/policy/canvas-policy.schema.js";
import type { CanvasGraph } from "../../../src/services/canvas/graph/canvas-graph.types.js";

function node(
  type: CanvasGraph["nodes"][number]["type"],
  id = randomUUID(),
): CanvasGraph["nodes"][number] {
  return { id, type, position: { x: 0, y: 0 }, config: {} };
}

function edge(
  source: CanvasGraph["nodes"][number],
  target: CanvasGraph["nodes"][number],
  sourcePort: "trigger" | "data" = "trigger",
  targetPort: "trigger" | "data" = "trigger",
): CanvasGraph["edges"][number] {
  return {
    id: randomUUID(),
    source: { node_id: source.id, port: sourcePort },
    target: { node_id: target.id, port: targetPort },
  };
}

describe("compileWorkflow", () => {
  const workflowId = randomUUID();

  it("produces topological execution order for a simple DAG", () => {
    const start = node("workflow_start");
    const gate = node("dry_run_gate");
    const action = node("place_order", undefined);
    action.config = { order_type: "limit" };
    const stop = node("workflow_stop");

    const graph: CanvasGraph = {
      nodes: [start, gate, action, stop],
      edges: [
        edge(start, gate),
        edge(gate, action, "trigger", "trigger"),
        edge(action, stop, "data", "signal"),
      ],
    };

    const policy = createDefaultCanvasPolicy(workflowId);
    const result = compileWorkflow({ workflowId, revision: 1, graph, policy });

    assert.equal(result.ok, true);
    if (!result.ok) return;

    assert.deepEqual(result.compiled.entry_node_ids, [start.id]);
    assert.ok(result.compiled.execution_order.indexOf(start.id) < result.compiled.execution_order.indexOf(stop.id));
    assert.equal(result.compiled.compiled_hash.length, 16);

    const resolved = result.compiled.nodes.find((n) => n.id === action.id);
    assert.equal(resolved?.resolved_type, "polymarket_place_limit");
  });

  it("rejects graphs with cycles", () => {
    const a = node("workflow_start");
    const b = node("if_condition");
    const graph: CanvasGraph = {
      nodes: [a, b],
      edges: [edge(a, b), edge(b, a)],
    };

    const result = compileWorkflow({
      workflowId,
      revision: 1,
      graph,
      policy: createDefaultCanvasPolicy(workflowId),
    });

    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.ok(result.errors.some((e) => e.code === "GRAPH_CYCLE"));
  });

  it("surfaces policy binding warnings for disallowed actions", () => {
    const start = node("workflow_start");
    const action = node("copy_trade");
    const stop = node("workflow_stop");

    const graph: CanvasGraph = {
      nodes: [start, action, stop],
      edges: [edge(start, action), edge(action, stop, "data", "signal")],
    };

    const policy = createDefaultCanvasPolicy(workflowId);
    policy.allowed_actions = policy.allowed_actions.filter((t) => t !== "copy_trade");

    const result = compileWorkflow({ workflowId, revision: 1, graph, policy });
    assert.equal(result.ok, true);
    if (!result.ok) return;

    assert.ok(
      result.compiled.policy_warnings.some((w) => w.code === "POLICY_ACTION_NOT_ALLOWED"),
    );
  });

  it("requires workflow_start per connected component", () => {
    const orphan = node("if_condition");
    const graph: CanvasGraph = { nodes: [orphan], edges: [] };

    const result = compileWorkflow({
      workflowId,
      revision: 1,
      graph,
      policy: createDefaultCanvasPolicy(workflowId),
    });

    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.ok(result.errors.some((e) => e.code === "MISSING_ENTRY"));
  });
});
