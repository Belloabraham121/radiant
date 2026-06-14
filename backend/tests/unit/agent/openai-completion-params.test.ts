import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  openAiMaxOutputTokens,
  openAiUsesMaxCompletionTokens,
} from "../../../src/services/agent/runtime/openai-completion-params.js";

describe("openai-completion-params", () => {
  it("uses max_completion_tokens for GPT-5 models", () => {
    assert.equal(openAiUsesMaxCompletionTokens("gpt-5.4-mini"), true);
    assert.deepEqual(openAiMaxOutputTokens("gpt-5.4-mini", 1024), {
      max_completion_tokens: 1024,
    });
  });

  it("uses max_tokens for GPT-4o family", () => {
    assert.equal(openAiUsesMaxCompletionTokens("gpt-4o-mini"), false);
    assert.deepEqual(openAiMaxOutputTokens("gpt-4o-mini", 512), { max_tokens: 512 });
  });

  it("uses max_completion_tokens for o-series models", () => {
    assert.equal(openAiUsesMaxCompletionTokens("o3-mini"), true);
  });
});
