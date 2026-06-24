import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildSystemPrompt } from "../../../src/services/agent/runtime/prompts.js";
import { buildPersonalityIntroLines } from "../../../src/services/agent/prompts/core/personality.js";

describe("buildSystemPrompt call_app_action routing", () => {
  it("prefers call_app_action for saved projects and execute_transaction for chat-only trades", () => {
    const prompt = buildSystemPrompt({ mode: "full" });

    assert.match(prompt, /call_app_action/);
    assert.match(prompt, /execute_transaction for chat-only/);
    assert.match(prompt, /query_chain project_actions/);
    assert.match(prompt, /generate_app/);
    assert.match(prompt, /Do NOT call swap_quote, execute_transaction, or call_app_action unless they clearly ask to trade/);
  });

  it("still composes modular core personality at the start of the prompt", () => {
    const prompt = buildSystemPrompt({ mode: "full" });
    const intro = buildPersonalityIntroLines()[0];
    assert.ok(prompt.startsWith(intro));
  });
});
