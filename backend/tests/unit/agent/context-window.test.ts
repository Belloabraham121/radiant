import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildAgentContextMessages } from "../../../src/services/agent/context-window.js";

describe("buildAgentContextMessages", () => {
  it("keeps only user and assistant roles", () => {
    const context = buildAgentContextMessages([
      { role: "system", content: "ignored" },
      { role: "user", content: "Hello" },
      { role: "tool", content: "ignored" },
      { role: "assistant", content: "Hi there" },
    ]);

    assert.deepEqual(context, [
      { role: "user", content: "Hello" },
      { role: "assistant", content: "Hi there" },
    ]);
  });

  it("caps by message count from the most recent messages", () => {
    const context = buildAgentContextMessages(
      [
        { role: "user", content: "first" },
        { role: "assistant", content: "second" },
        { role: "user", content: "third" },
        { role: "assistant", content: "fourth" },
      ],
      { maxMessages: 2, maxChars: 10_000 },
    );

    assert.deepEqual(context, [
      { role: "user", content: "third" },
      { role: "assistant", content: "fourth" },
    ]);
  });

  it("drops oldest messages when total chars exceed the cap", () => {
    const context = buildAgentContextMessages(
      [
        { role: "user", content: "What's my balance?" },
        { role: "assistant", content: "You hold 12 SUI." },
        { role: "user", content: "Thanks" },
      ],
      { maxMessages: 50, maxChars: 30 },
    );

    assert.equal(context.length, 2);
    assert.equal(context[0]?.content, "You hold 12 SUI.");
    assert.equal(context[1]?.content, "Thanks");
  });

  it("includes the first turn when building context for a second message", () => {
    const context = buildAgentContextMessages([
      { role: "user", content: "What's my balance?" },
      { role: "assistant", content: "You hold 12 SUI." },
      { role: "user", content: "Thanks" },
    ]);

    assert.equal(context[0]?.content, "What's my balance?");
    assert.equal(context.at(-1)?.content, "Thanks");
  });
});
