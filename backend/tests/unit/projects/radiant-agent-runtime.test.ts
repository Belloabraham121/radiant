import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createRadiantAgentRuntime } from "../../../src/services/projects/radiant-agent-runtime.factory.js";

describe("radiant agent runtime factory", () => {
  it("runs registered handler when animate is true, then calls executeAction", async () => {
    const calls: string[] = [];
    const highlights: string[] = [];

    const runtime = createRadiantAgentRuntime({
      executeAction: async (action) => {
        calls.push(`api:${action}`);
        return { status: "executed", digest: "0xabc", explorer_url: null, result: {} };
      },
      highlight: (targetId, className) => {
        highlights.push(`${targetId}:${className ?? "agent-focused"}`);
      },
    });

    runtime.register("swap", async (_params, ctx) => {
      calls.push("handler");
      ctx.highlight("swap-submit", "agent-clicking");
    });

    const result = (await runtime.execute("swap", { amount: 1 }, { animate: true })) as {
      status: string;
    };

    assert.equal(result.status, "executed");
    assert.deepEqual(calls, ["handler", "api:swap"]);
    assert.deepEqual(highlights, ["swap-submit:agent-clicking"]);
  });

  it("skips handler when animate is false", async () => {
    const calls: string[] = [];
    const runtime = createRadiantAgentRuntime({
      executeAction: async (action) => {
        calls.push(`api:${action}`);
        return { status: "executed", digest: "0x1", explorer_url: null, result: {} };
      },
    });

    runtime.register("swap", async () => {
      calls.push("handler");
    });

    await runtime.execute("swap", { amount: 1 }, { animate: false });
    assert.deepEqual(calls, ["api:swap"]);
  });

  it("emits active events around execute", async () => {
    const activeStates: boolean[] = [];
    const runtime = createRadiantAgentRuntime({
      executeAction: async () => ({ status: "executed", digest: "0x1", explorer_url: null, result: {} }),
    });

    runtime.subscribe((event) => {
      if (event.type === "active") {
        activeStates.push(event.active);
      }
    });

    await runtime.execute("swap", {}, { animate: false });
    assert.deepEqual(activeStates, [true, false]);
  });
});
