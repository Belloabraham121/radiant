import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  coerceGenerateAppFiles,
  normalizeGenerateAppInput,
} from "../../../src/services/projects/normalize-generate-app-input.js";

describe("coerceGenerateAppFiles", () => {
  it("accepts a standard array", () => {
    const files = coerceGenerateAppFiles([
      { path: "app/page.tsx", content: "export default function Page() { return null; }" },
    ]);
    assert.equal(files.length, 1);
    assert.equal(files[0]?.path, "app/page.tsx");
  });

  it("wraps a single file object", () => {
    const files = coerceGenerateAppFiles({
      path: "components/SwapForm.tsx",
      content: "export default function SwapForm() { return null; }",
    });
    assert.equal(files.length, 1);
    assert.equal(files[0]?.path, "components/SwapForm.tsx");
  });

  it("flattens numeric-keyed objects", () => {
    const files = coerceGenerateAppFiles({
      "0": { path: "app/page.tsx", content: "a" },
      "1": { path: "components/X.tsx", content: "b" },
    });
    assert.equal(files.length, 2);
  });
});

describe("normalizeGenerateAppInput", () => {
  it("recovers name and files from partial JSON arguments", () => {
    const raw =
      '{"name":"Swap UI","files":[{"path":"components/SwapForm.tsx","content":"export default function SwapForm(){return null;}"}';
    const normalized = normalizeGenerateAppInput({}, raw);
    assert.equal(normalized.name, "Swap UI");
    assert.equal((normalized.files as unknown[]).length, 1);
  });

  it("maps title to name", () => {
    const normalized = normalizeGenerateAppInput({
      title: "My DEX",
      files: [{ path: "app/page.tsx", content: "x" }],
    });
    assert.equal(normalized.name, "My DEX");
  });
});
