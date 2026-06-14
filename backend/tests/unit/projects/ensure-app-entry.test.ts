import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ensureAppEntry } from "../../../src/services/projects/ensure-app-entry.js";

describe("ensureAppEntry", () => {
  it("keeps files when App.tsx exists", () => {
    const files = [
      { path: "src/App.tsx", content: "export default () => null;" },
      { path: "src/components/SwapForm.tsx", content: "export default () => <div />" },
    ];
    assert.deepEqual(ensureAppEntry(files), files);
  });

  it("adds App.tsx importing first component when missing", () => {
    const files = [
      {
        path: "src/components/SwapForm.tsx",
        content: "export default function SwapForm() { return null; }",
      },
    ];
    const result = ensureAppEntry(files);
    assert.equal(result.length, 2);
    const app = result.find((f) => f.path === "src/App.tsx");
    assert.ok(app);
    assert.match(app!.content, /from "\.\/components\/SwapForm"/);
  });
});
