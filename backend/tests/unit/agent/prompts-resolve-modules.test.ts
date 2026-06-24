import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildSystemPrompt } from "../../../src/services/agent/runtime/prompts.js";
import {
  resolveOptionalPromptModules,
  resolvePromptModules,
} from "../../../src/services/agent/prompts/resolve-modules.js";
import { defaultAgentPermissions } from "../../../src/services/agent/agent-permissions.service.js";
import { CORE_MODULE_IDS } from "../../../src/services/agent/prompts/registry.js";

const baseInput = {
  chainId: "sui" as const,
  permissions: defaultAgentPermissions(),
};

describe("resolvePromptModules (scoped mode)", () => {
  it("swap message includes swap modules and excludes margin and predict", () => {
    const optional = resolveOptionalPromptModules({
      ...baseInput,
      userMessage: "swap 10 SUI to USDC",
    });
    assert.ok(optional.includes("protocol:deepbook:swap"));
    assert.ok(!optional.includes("protocol:deepbook:margin"));
    assert.ok(!optional.includes("protocol:deepbook:predict"));
  });

  it("margin message includes margin and excludes predict", () => {
    const optional = resolveOptionalPromptModules({
      ...baseInput,
      userMessage: "open a margin position on SUI_USDC",
    });
    assert.ok(optional.includes("protocol:deepbook:margin"));
    assert.ok(!optional.includes("protocol:deepbook:predict"));
  });

  it("build message includes artifact modules and excludes deepbook margin", () => {
    const optional = resolveOptionalPromptModules({
      ...baseInput,
      userMessage: "build a swap UI like Uniswap",
    });
    assert.ok(optional.includes("artifact:build"));
    assert.ok(optional.includes("artifact:defi-ui"));
    assert.ok(!optional.includes("protocol:deepbook:margin"));
    assert.ok(!optional.includes("protocol:deepbook:swap"));
  });

  it("unions workflow planner actions into optional modules", () => {
    const optional = resolveOptionalPromptModules({
      ...baseInput,
      userMessage: "do the plan",
      workflowActions: ["deepbook_margin_borrow"],
      workflowQueries: ["predict_markets"],
    });
    assert.ok(optional.includes("protocol:deepbook:margin"));
    assert.ok(optional.includes("protocol:deepbook:predict"));
  });

  it("always includes core modules in resolvePromptModules", () => {
    const modules = resolvePromptModules({
      ...baseInput,
      userMessage: "hello",
    });
    for (const coreId of CORE_MODULE_IDS) {
      assert.ok(modules.includes(coreId));
    }
  });

  it("pinned app scope adds artifact modules", () => {
    const optional = resolveOptionalPromptModules({
      ...baseInput,
      pinnedAppScope: { kind: "session_draft", name: "My DEX" },
    });
    assert.ok(optional.includes("artifact:edit"));
  });
});

describe("buildSystemPrompt scoped mode", () => {
  it("full mode matches baseline line count", () => {
    const full = buildSystemPrompt({ mode: "full" });
    assert.equal(full.split("\n").length, 89);
  });

  it("scoped mode produces a shorter prompt than full mode", () => {
    const full = buildSystemPrompt({ mode: "full" });
    const scoped = buildSystemPrompt({
      mode: "scoped",
      userMessage: "what is DeepBook?",
    });
    assert.ok(scoped.length < full.length);
    assert.ok(scoped.includes("You are Radiant"));
    assert.ok(scoped.includes("DeepBook runs on"));
    assert.ok(!scoped.includes("DeepBook Margin enables leveraged trading"));
  });

  it("scoped swap message includes swap guidance not margin block", () => {
    const scoped = buildSystemPrompt({
      mode: "scoped",
      userMessage: "swap 10 SUI to USDC",
    });
    assert.ok(scoped.includes("For token swaps on Sui with no saved project context"));
    assert.ok(!scoped.includes("DeepBook Margin enables leveraged trading"));
  });
});
