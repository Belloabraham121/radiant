import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { describe, it } from "node:test";
import { buildSystemPrompt } from "../../../src/services/agent/runtime/prompts.js";

/** SHA-256 of default buildSystemPrompt() output — update only when prompt content intentionally changes. */
const PROMPT_BASELINE_SHA256 =
  "53264761f507522f558acb87c5f00301f4b7e270c27a717f8703b8dc89ce7590";

const PROMPT_BASELINE_LINE_COUNT = 89;

describe("buildSystemPrompt baseline parity", () => {
  it("matches frozen line count and SHA-256 (Phase 0 regression guard)", () => {
    const prompt = buildSystemPrompt({ mode: "full" });
    const hash = createHash("sha256").update(prompt).digest("hex");

    assert.equal(prompt.split("\n").length, PROMPT_BASELINE_LINE_COUNT);
    assert.equal(hash, PROMPT_BASELINE_SHA256);
  });

  it("appends pinned scope and memory without changing core line count semantics", () => {
    const withExtras = buildSystemPrompt({
      mode: "full",
      memoryBlock: "prefers SUI",
      pinnedAppScope: {
        kind: "session_draft",
        name: "My DEX",
      },
    });

    assert.ok(withExtras.includes("User memory:"));
    assert.ok(withExtras.includes("prefers SUI"));
    assert.ok(withExtras.includes("User pinned chat app"));
    assert.ok(withExtras.length > buildSystemPrompt({ mode: "full" }).length);
  });
});
