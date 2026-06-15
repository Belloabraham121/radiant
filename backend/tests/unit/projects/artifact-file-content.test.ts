import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  normalizeArtifactFileContent,
  unescapeJsonString,
} from "../../../src/services/projects/artifact-file-content.js";

describe("artifact file content normalization", () => {
  it("unescapes JSON-escaped TSX source", () => {
    const raw = '\\"use client\\";\\n\\nimport { useState } from \\"react\\";';
    const normalized = normalizeArtifactFileContent(raw);
    assert.equal(normalized, '"use client";\n\nimport { useState } from "react";');
  });

  it("leaves normal multiline source unchanged", () => {
    const source = `"use client";\n\nexport default function Page() {\n  return null;\n}\n`;
    assert.equal(normalizeArtifactFileContent(source), source);
  });

  it("normalizes double-escaped use client prefix from preview errors", () => {
    const raw =
      '\\"use client\\";\\n\\nimport { useEffect, useMemo, useState } from \\"react\\";';
    const normalized = normalizeArtifactFileContent(raw);
    assert.match(normalized, /^"use client";\n\nimport/);
  });

  it("unescapeJsonString handles common escapes", () => {
    assert.equal(unescapeJsonString("a\\nb\\tc\\\\d"), "a\nb\tc\\d");
  });
});
