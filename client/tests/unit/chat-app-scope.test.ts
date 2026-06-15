import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  parseChatAppScope,
  parseComposerAppMention,
  stripComposerAppMention,
} from "../../src/lib/chat-app-scope";

describe("chat-app-scope client helpers", () => {
  it("opens picker for @project uniswap", () => {
    const parsed = parseComposerAppMention("Swap @project uniswap");
    assert.equal(parsed.open, true);
    assert.equal(parsed.filter, "uniswap");
  });

  it("opens picker for direct @uniswap mention", () => {
    const parsed = parseComposerAppMention("Swap @uniswap");
    assert.equal(parsed.open, true);
    assert.equal(parsed.filter, "uniswap");
  });

  it("strips mention from composer text", () => {
    assert.equal(stripComposerAppMention("Swap @project uniswap"), "Swap");
  });

  it("parses app_scope from API JSON", () => {
    const scope = parseChatAppScope({
      kind: "session_draft",
      name: "Uniswap Swap UI",
    });
    assert.equal(scope?.kind, "session_draft");
    assert.equal(scope?.name, "Uniswap Swap UI");
  });
});
