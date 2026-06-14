import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildPreviewArtifactPayload } from "../../../src/services/projects/preview-artifact.js";

describe("buildPreviewArtifactPayload", () => {
  it("auto-adds app/page.tsx for streaming component-only previews", () => {
    const preview = buildPreviewArtifactPayload({
      name: "Swap UI",
      files: [
        {
          path: "components/SwapForm.tsx",
          content: "export default function SwapForm() { return null; }",
        },
      ],
    });

    assert.ok(preview);
    assert.ok(preview!.files.some((file) => file.path === "app/page.tsx"));
    assert.ok(preview!.files.some((file) => file.path === "lib/radiant-client.ts"));
  });
});
