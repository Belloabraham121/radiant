import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  assembleBuilderTurnMessages,
  buildBuildContextMessages,
} from "../../../src/services/canvas/build/canvas-build-memory.service.js";

describe("buildBuildContextMessages", () => {
  it("keeps only user and assistant roles", () => {
    const context = buildBuildContextMessages([
      { role: "user", content: "Add BTC alert" },
      { role: "assistant", content: "Added price chart and threshold." },
    ]);

    assert.deepEqual(context, [
      { role: "user", content: "Add BTC alert" },
      { role: "assistant", content: "Added price chart and threshold." },
    ]);
  });

  it("caps by message count from the most recent messages", () => {
    const context = buildBuildContextMessages(
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
    const context = buildBuildContextMessages(
      [
        { role: "user", content: "Build a Brazil threshold workflow" },
        { role: "assistant", content: "Added polymarket feed and if-condition." },
        { role: "user", content: "Change Brazil threshold to 0.65" },
      ],
      { maxMessages: 20, maxChars: 70 },
    );

    assert.equal(context.length, 2);
    assert.equal(context[0]?.content, "Added polymarket feed and if-condition.");
    assert.equal(context[1]?.content, "Change Brazil threshold to 0.65");
  });
});

describe("assembleBuilderTurnMessages", () => {
  it("places system prompt, capped history, then current user turn with graph summary", () => {
    const messages = assembleBuilderTurnMessages(
      "You are the Builder.",
      [
        { role: "user", content: "Build BTC alert" },
        { role: "assistant", content: "Added chart + threshold." },
      ],
      "Change threshold to 5%\n\nCurrent graph (use exact ids…):\nNodes:\n(none)",
    );

    assert.equal(messages.length, 4);
    assert.equal(messages[0]?.role, "system");
    assert.equal(messages[1]?.content, "Build BTC alert");
    assert.equal(messages[2]?.content, "Added chart + threshold.");
    assert.equal(messages[3]?.role, "user");
    assert.match(messages[3]?.content ?? "", /Change threshold to 5%/);
    assert.match(messages[3]?.content ?? "", /Current graph/);
  });
});
