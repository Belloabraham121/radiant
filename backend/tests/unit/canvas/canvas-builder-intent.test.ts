import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { describe, it } from "node:test";
import {
  assembleAskTurnMessages,
  inferBuilderEditIntent,
  resolveBuilderIntentMode,
  runAskTextCompletion,
} from "../../../src/services/canvas/build/canvas-builder-agent.service.js";
import type {
  CanvasLlmProvider,
  CanvasLlmModelTier,
} from "../../../src/services/canvas/llm/canvas-llm.types.js";
import type { CanvasGraph } from "../../../src/services/canvas/graph/canvas-graph.types.js";
import { slugToNodeType } from "../../../src/services/canvas/graph/node-slug-map.js";

const sampleGraph: CanvasGraph = {
  nodes: [
    {
      id: randomUUID(),
      type: slugToNodeType("threshold")!,
      position: { x: 0, y: 0 },
      config: { metric: "mid", operator: "<", value: 0.35 },
    },
  ],
  edges: [],
};

describe("resolveBuilderIntentMode", () => {
  it("defaults to build when omitted", () => {
    assert.equal(resolveBuilderIntentMode(), "build");
    assert.equal(resolveBuilderIntentMode(undefined), "build");
  });

  it("preserves explicit ask or build", () => {
    assert.equal(resolveBuilderIntentMode("ask"), "ask");
    assert.equal(resolveBuilderIntentMode("build"), "build");
  });
});

describe("inferBuilderEditIntent", () => {
  it("uses explicit edit_intent from API", () => {
    assert.equal(inferBuilderEditIntent(sampleGraph, undefined, "create"), "create");
    assert.equal(inferBuilderEditIntent(sampleGraph, undefined, "patch"), "patch");
  });

  it("infers patch when selected_node_id is set", () => {
    const nodeId = sampleGraph.nodes[0]!.id;
    assert.equal(inferBuilderEditIntent(sampleGraph, nodeId, undefined), "patch");
  });

  it("infers create on empty graph", () => {
    assert.equal(inferBuilderEditIntent({ nodes: [], edges: [] }, undefined, undefined), "create");
  });

  it("does not infer patch from message-like edit keywords alone", () => {
    assert.equal(inferBuilderEditIntent(sampleGraph, undefined, undefined), undefined);
  });
});

describe("assembleAskTurnMessages", () => {
  it("builds advisor system prompt and graph context without tool instructions", () => {
    const messages = assembleAskTurnMessages(
      [{ role: "user", content: "What does the threshold do?" }],
      "Explain the threshold node\n\nCurrent graph:\nNodes:\n- id=abc slug=threshold",
    );

    assert.equal(messages[0]?.role, "system");
    assert.match(messages[0]?.content ?? "", /Workflow Advisor/);
    assert.doesNotMatch(messages[0]?.content ?? "", /add_node/);
    assert.equal(messages[1]?.role, "user");
    assert.equal(messages[2]?.role, "user");
    assert.match(messages[2]?.content ?? "", /Explain the threshold node/);
  });
});

describe("runAskTextCompletion", () => {
  it("uses streamCompletion only — not completeWithTools", async () => {
    let streamCalled = false;
    let toolsCalled = false;

    const mockProvider: CanvasLlmProvider = {
      id: "openai",
      resolveModel(_tier: CanvasLlmModelTier) {
        return "test-model";
      },
      async *streamCompletion() {
        streamCalled = true;
        yield { delta: "The threshold compares ", done: false };
        yield { delta: "market mid price.", done: true };
      },
      async complete() {
        return "fallback";
      },
      async completeWithTools() {
        toolsCalled = true;
        return { content: "", tool_calls: [] };
      },
    };

    const deltas: string[] = [];
    const answer = await runAskTextCompletion(
      mockProvider,
      "test-model",
      [{ role: "user", content: "Explain threshold" }],
      (text) => deltas.push(text),
    );

    assert.ok(streamCalled);
    assert.equal(toolsCalled, false);
    assert.equal(answer, "The threshold compares market mid price.");
    assert.equal(deltas.join(""), answer);
  });
});
