import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { AppError } from "../../../src/errors/app-error.js";
import {
  normalizeSandboxPath,
  normalizeSandboxReadPath,
  validateArtifactBatch,
} from "../../../src/services/sandbox/sandbox-paths.js";
import { resetSandboxConfigForTests } from "../../../src/config/sandbox.js";

describe("sandbox-paths", () => {
  it("normalizes relative src paths under /workspace", () => {
    assert.equal(normalizeSandboxPath("src/App.tsx"), "/workspace/src/App.tsx");
  });

  it("rejects path traversal", () => {
    assert.throws(
      () => normalizeSandboxPath("/workspace/src/../etc/passwd"),
      (error: unknown) => error instanceof AppError && error.code === "VALIDATION_ERROR",
    );
  });

  it("rejects writes outside allowed prefixes", () => {
    assert.throws(
      () => normalizeSandboxPath("/workspace/dist/index.html"),
      (error: unknown) => error instanceof AppError && error.code === "VALIDATION_ERROR",
    );
  });

  it("allows read paths under /workspace/dist", () => {
    assert.equal(
      normalizeSandboxReadPath("/workspace/dist/index.html"),
      "/workspace/dist/index.html",
    );
  });

  it("validateArtifactBatch enforces max bytes", () => {
    resetSandboxConfigForTests();
    process.env.DEPLOY_MAX_ARTIFACT_BYTES = "10";

    assert.throws(
      () =>
        validateArtifactBatch([
          { path: "src/App.tsx", content: "012345678901" },
        ]),
      (error: unknown) => error instanceof AppError && error.code === "VALIDATION_ERROR",
    );

    delete process.env.DEPLOY_MAX_ARTIFACT_BYTES;
    resetSandboxConfigForTests();
  });
});
