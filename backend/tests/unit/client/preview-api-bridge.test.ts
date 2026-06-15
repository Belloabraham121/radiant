import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isAppActionApiPath,
  rewritePreviewApiPath,
} from "../../../../client/src/lib/artifact-preview-bridge.ts";

describe("artifact preview bridge", () => {
  it("detects app action API paths", () => {
    assert.equal(isAppActionApiPath("/api/v1/projects/abc/actions/swap"), true);
    assert.equal(isAppActionApiPath("/api/v1/projects/abc/swap/quote"), false);
  });

  it("rewrites project action POST paths to installation scope", () => {
    const projectId = "00000000-0000-4000-8000-000000000011";
    const installationId = "00000000-0000-4000-8000-000000000022";
    const input = `/api/v1/projects/${projectId}/actions/swap`;

    assert.equal(
      rewritePreviewApiPath(input, projectId, installationId),
      `/api/v1/installations/${installationId}/actions/swap`,
    );
  });

  it("leaves paths unchanged without installation context", () => {
    const path = "/api/v1/projects/abc/actions/swap";
    assert.equal(rewritePreviewApiPath(path, "abc"), path);
  });
});
