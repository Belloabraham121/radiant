import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  mergePinnedAppScopeIntoCallAppAction,
  formatPinnedAppScopeForPrompt,
} from "../../../src/services/projects/pinned-app-scope.types.js";

describe("pinned-app-scope", () => {
  it("merges installation scope when call_app_action omits scope", () => {
    const merged = mergePinnedAppScopeIntoCallAppAction(
      { action: "swap", params: { amount: 1, side: "sell" } },
      {
        kind: "installation",
        installation_id: "00000000-0000-4000-8000-000000000099",
        name: "Uniswap",
      },
    );
    assert.equal(merged.installation_id, "00000000-0000-4000-8000-000000000099");
  });

  it("does not override explicit project_id", () => {
    const merged = mergePinnedAppScopeIntoCallAppAction(
      {
        action: "swap",
        params: {},
        project_id: "00000000-0000-4000-8000-000000000001",
      },
      {
        kind: "installation",
        installation_id: "00000000-0000-4000-8000-000000000099",
        name: "Uniswap",
      },
    );
    assert.equal(merged.project_id, "00000000-0000-4000-8000-000000000001");
    assert.equal(merged.installation_id, undefined);
  });

  it("formats prompt block with project_id", () => {
    const text = formatPinnedAppScopeForPrompt({
      kind: "project",
      project_id: "00000000-0000-4000-8000-000000000002",
      name: "Uniswap",
    });
    assert.match(text, /project_id: 00000000-0000-4000-8000-000000000002/);
    assert.match(text, /call_app_action/);
  });

  it("merges session_draft scope into call_app_action", () => {
    const merged = mergePinnedAppScopeIntoCallAppAction(
      { action: "swap", params: { amount: 1, side: "sell" } },
      { kind: "session_draft", name: "Uniswap Swap UI" },
    );
    assert.equal(merged.use_session_draft, true);
    assert.equal(merged.app_name, "Uniswap Swap UI");
  });

  it("prompt instructs execute through app UI", () => {
    const text = formatPinnedAppScopeForPrompt({
      kind: "session_draft",
      name: "Uniswap",
    });
    assert.match(text, /app preview/i);
    assert.match(text, /project_actions/i);
    assert.match(text, /call_app_action/i);
    assert.match(text, /drive the UI/i);
    assert.doesNotMatch(text, /animate the form/i);
  });

  it("installation prompt avoids ambiguous session project resolution", () => {
    const text = formatPinnedAppScopeForPrompt({
      kind: "installation",
      installation_id: "00000000-0000-4000-8000-000000000099",
      name: "Simple Todo App",
    });
    assert.match(text, /INSTALLED app/i);
    assert.match(text, /installation_id: 00000000-0000-4000-8000-000000000099/);
    assert.match(text, /never pass app_name/i);
    assert.match(text, /project_actions/i);
  });
});
