import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { deriveSessionTitle } from "../../../src/services/conversation/conversation.service.js";

describe("deriveSessionTitle", () => {
  it("truncates long first messages to about 60 characters", () => {
    const title = deriveSessionTitle(
      "Can you help me plan a savings goal for my upcoming trip to Japan next spring?",
    );
    assert.equal(title.length, 60);
    assert.ok(title.endsWith("…"));
  });

  it("normalizes whitespace", () => {
    assert.equal(deriveSessionTitle("  What's   my   balance?  "), "What's my balance?");
  });
});
