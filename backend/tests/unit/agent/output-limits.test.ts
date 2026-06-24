import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getAgentOutputLimitsConfig } from "../../../src/config/agent.js";
import { openAiMaxOutputTokens } from "../../../src/services/agent/runtime/openai-completion-params.js";
import {
  OUTPUT_TRUNCATION_SUFFIX,
  OutputLimitTracker,
  truncateAssistantOutput,
} from "../../../src/services/agent/runtime/output-limits.js";

describe("agent output limits config", () => {
  it("getAgentOutputLimitsConfig exposes defaults", () => {
    const limits = getAgentOutputLimitsConfig();
    assert.equal(limits.maxOutputTokensChat, 4096);
    assert.equal(limits.maxReplyChars, 12_000);
    assert.equal(limits.maxTurnOutputChars, 32_000);
    assert.equal(limits.maxToolArgsChars, 524_288);
  });

  it("max output tokens flow through openAiMaxOutputTokens", () => {
    const { maxOutputTokensChat } = getAgentOutputLimitsConfig();
    assert.deepEqual(openAiMaxOutputTokens("gpt-4o-mini", maxOutputTokensChat), {
      max_tokens: 4096,
    });
  });
});

describe("output-limits utilities", () => {
  it("truncateAssistantOutput leaves short text unchanged", () => {
    const result = truncateAssistantOutput("hello", 100);
    assert.equal(result.text, "hello");
    assert.equal(result.truncated, false);
  });

  it("truncateAssistantOutput slices long text and appends suffix", () => {
    const long = "a".repeat(200);
    const maxChars = 80;
    const result = truncateAssistantOutput(long, maxChars);
    assert.equal(result.truncated, true);
    assert.ok(result.text.length <= maxChars);
    assert.match(result.text, /truncated/);
  });

  it("truncateAssistantOutput adds suffix when stream hard-capped at budget", () => {
    const text = "word ".repeat(400).trim();
    const maxChars = 500;
    const hardCapped = text.slice(0, maxChars);
    const result = truncateAssistantOutput(hardCapped, maxChars, {
      assumeOverLimit: true,
    });
    assert.equal(result.truncated, true);
    assert.match(result.text, /truncated/);
    assert.ok(result.text.length <= maxChars);
  });

  it("OutputLimitTracker enforces per-turn budget across steps", () => {
    const tracker = new OutputLimitTracker(100);
    assert.equal(tracker.budgetForStep(60), 60);
    tracker.recordAssistantOutput("a".repeat(60));
    assert.equal(tracker.remaining, 40);
    assert.equal(tracker.budgetForStep(60), 40);
    tracker.recordAssistantOutput("b".repeat(40));
    assert.equal(tracker.isExhausted, true);
    assert.equal(tracker.budgetForStep(60), 0);
  });

  it("OUTPUT_TRUNCATION_SUFFIX is stable", () => {
    assert.match(OUTPUT_TRUNCATION_SUFFIX, /shorter summary/);
  });
});
