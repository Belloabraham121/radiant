import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  clearAllStoredChatAppScopes,
  parseChatAppScope,
  parseComposerAppMention,
  saveStoredChatAppScope,
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

  it("clearAllStoredChatAppScopes removes all scope keys", () => {
    const storage = new Map<string, string>();
    const sessionStorageMock = {
      get length() {
        return storage.size;
      },
      key(index: number) {
        return [...storage.keys()][index] ?? null;
      },
      getItem(key: string) {
        return storage.get(key) ?? null;
      },
      setItem(key: string, value: string) {
        storage.set(key, value);
      },
      removeItem(key: string) {
        storage.delete(key);
      },
    };
    const originalWindow = globalThis.window;
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: { sessionStorage: sessionStorageMock, localStorage: sessionStorageMock },
    });

    try {
      saveStoredChatAppScope("session-a", {
        kind: "session_draft",
        name: "Draft A",
      });
      saveStoredChatAppScope("session-b", {
        kind: "project",
        project_id: "00000000-0000-4000-8000-000000000001",
        name: "Project B",
      });
      sessionStorageMock.setItem("radiant:other", "keep");
      clearAllStoredChatAppScopes();
      assert.equal(storage.has("radiant:chat-app-scope:session-a"), false);
      assert.equal(storage.has("radiant:chat-app-scope:session-b"), false);
      assert.equal(storage.get("radiant:other"), "keep");
    } finally {
      Object.defineProperty(globalThis, "window", {
        configurable: true,
        value: originalWindow,
      });
    }
  });
});
