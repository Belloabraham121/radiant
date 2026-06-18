import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { mergeArtifactFileSets } from "../../../src/services/projects/artifact-context.service.js";
import {
  mergePinnedAppScopeIntoArtifactTool,
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

  it("does not override explicit project_id on call_app_action", () => {
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

  it("merges pinned project into edit_app scope", () => {
    const merged = mergePinnedAppScopeIntoArtifactTool(
      { edits: [{ path: "app/page.tsx", new_string: "x" }] },
      {
        kind: "project",
        project_id: "00000000-0000-4000-8000-000000000002",
        name: "Margin Trading App",
      },
    );
    assert.equal(merged.project_id, "00000000-0000-4000-8000-000000000002");
  });

  it("does not set project_id for session_draft pin on artifact tools", () => {
    const merged = mergePinnedAppScopeIntoArtifactTool(
      { edits: [{ path: "app/page.tsx", new_string: "x" }] },
      { kind: "session_draft", name: "Margin Trading App" },
    );
    assert.equal(merged.project_id, undefined);
  });

  it("formats saved project pin with UI edit guidance", () => {
    const text = formatPinnedAppScopeForPrompt({
      kind: "project",
      project_id: "00000000-0000-4000-8000-000000000002",
      name: "Margin Trading App",
    });
    assert.match(text, /Margin Trading App/);
    assert.match(text, /edit_app/);
    assert.match(text, /call_app_action/);
    assert.match(text, /never ask the user for project ids/i);
  });

  it("merges session_draft scope into call_app_action", () => {
    const merged = mergePinnedAppScopeIntoCallAppAction(
      { action: "swap", params: { amount: 1, side: "sell" } },
      { kind: "session_draft", name: "Uniswap Swap UI" },
    );
    assert.equal(merged.use_session_draft, true);
    assert.equal(merged.app_name, "Uniswap Swap UI");
  });

  it("session_draft prompt covers UI edits and in-app actions", () => {
    const text = formatPinnedAppScopeForPrompt({
      kind: "session_draft",
      name: "Uniswap",
    });
    assert.match(text, /edit_app/);
    assert.match(text, /call_app_action/);
    assert.match(text, /Never describe a UI fix without calling edit_app/i);
  });

  it("installation prompt notes source edits are not available", () => {
    const text = formatPinnedAppScopeForPrompt({
      kind: "installation",
      installation_id: "00000000-0000-4000-8000-000000000099",
      name: "Simple Todo App",
    });
    assert.match(text, /cannot be edited in place/i);
    assert.match(text, /call_app_action/i);
  });
});

describe("mergeArtifactFileSets", () => {
  it("preserves existing files and overlays updates", () => {
    const merged = mergeArtifactFileSets(
      [
        { path: "app/page.tsx", content: "old page" },
        { path: "components/Chart.tsx", content: "old chart" },
      ],
      [{ path: "components/Chart.tsx", content: "new chart" }],
    );
    assert.equal(merged.length, 2);
    const chart = merged.find((file) => file.path === "components/Chart.tsx");
    const page = merged.find((file) => file.path === "app/page.tsx");
    assert.equal(chart?.content, "new chart");
    assert.equal(page?.content, "old page");
  });
});
