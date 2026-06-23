import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildPersonalityIntroLines,
  buildPersonalityThreadContextLine,
} from "../../../src/services/agent/prompts/core/personality.js";
import { buildPermissionLines } from "../../../src/services/agent/prompts/core/permissions.js";
import {
  buildDefaultChainLine,
  buildToolRoutingOverviewLines,
  buildToolRoutingWorkflowLines,
} from "../../../src/services/agent/prompts/core/tool-routing.js";
import { buildErrorHandlingLines } from "../../../src/services/agent/prompts/core/errors.js";
import { defaultAgentPermissions } from "../../../src/services/agent/agent-permissions.service.js";
import { CORE_MODULE_IDS, CORE_PROMPT_MODULES } from "../../../src/services/agent/prompts/registry.js";

describe("prompt core modules", () => {
  it("registers four core module ids", () => {
    assert.deepEqual(CORE_MODULE_IDS, [
      "core:personality",
      "core:tool-routing",
      "core:permissions",
      "core:errors",
    ]);
    assert.equal(CORE_PROMPT_MODULES.length, 4);
  });

  it("personality includes Radiant identity and research/execution/build routing", () => {
    const text = buildPersonalityIntroLines().join("\n");
    assert.match(text, /You are Radiant/);
    assert.match(text, /RESEARCH, EXECUTION, or BUILD/);
    assert.match(text, /always write a complete reply/);
    assert.match(text, /agent wallet is resolved from their authenticated session/);
  });

  it("personality thread context reminds agent of session-only memory", () => {
    const text = buildPersonalityThreadContextLine().join("\n");
    assert.match(text, /only have context from this chat thread/);
  });

  it("core modules exclude DeepBook, margin, and artifact build specifics", () => {
    const ctx = { chainId: "sui" as const, permissions: defaultAgentPermissions() };
    const coreText = [
      ...buildPersonalityIntroLines(),
      ...buildDefaultChainLine(ctx),
      ...buildPermissionLines(ctx),
      ...buildToolRoutingOverviewLines(),
      ...buildToolRoutingWorkflowLines(),
      ...buildErrorHandlingLines(),
    ].join("\n");

    assert.doesNotMatch(coreText, /deepbook_margin/);
    assert.doesNotMatch(coreText, /margin_manager_key/);
    assert.doesNotMatch(coreText, /CRITICAL — edit_app/);
    assert.doesNotMatch(coreText, /predict_mint/);
    assert.doesNotMatch(coreText, /pool_key SUI_USDC/);
  });

  it("tool-routing overview names generic platform tools", () => {
    const text = buildToolRoutingOverviewLines().join("\n");
    assert.match(text, /query_chain/);
    assert.match(text, /call_app_action/);
    assert.match(text, /execute_transaction for chat-only/);
  });

  it("permissions reflect auto-approve when disabled", () => {
    const lines = buildPermissionLines({
      chainId: "sui",
      permissions: {
        ...defaultAgentPermissions(),
        auto_approve_enabled: false,
      },
    });
    assert.ok(lines.some((line) => line.includes("Auto-approve is OFF")));
  });
});
