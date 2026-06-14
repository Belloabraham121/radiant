import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { AppError } from "../../../src/errors/app-error.js";
import { resetSandboxConfigForTests } from "../../../src/config/sandbox.js";
import {
  normalizeMoveSourcePath,
  normalizeSandboxPath,
  normalizeSandboxReadPath,
  SANDBOX_ALLOWED_WRITE_EXTENSIONS,
  validateArtifactBatch,
  validateDistOutputBytes,
  validateMoveSourceBatch,
} from "../../../src/services/sandbox/sandbox-paths.js";

describe("sandbox-paths", () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
    resetSandboxConfigForTests();
  });

  it("normalizes relative app, src, and public paths under /workspace", () => {
    assert.equal(normalizeSandboxPath("app/page.tsx"), "/workspace/app/page.tsx");
    assert.equal(normalizeSandboxPath("components/SwapForm.tsx"), "/workspace/components/SwapForm.tsx");
    assert.equal(normalizeSandboxPath("lib/radiant-client.ts"), "/workspace/lib/radiant-client.ts");
    assert.equal(normalizeSandboxPath("src/App.tsx"), "/workspace/src/App.tsx");
    assert.equal(normalizeSandboxPath("public/favicon.svg"), "/workspace/public/favicon.svg");
  });

  it("accepts all allowed write extensions", () => {
    for (const ext of SANDBOX_ALLOWED_WRITE_EXTENSIONS) {
      const path = normalizeSandboxPath(`src/file${ext}`);
      assert.equal(path, `/workspace/src/file${ext}`);
    }
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
    assert.throws(
      () => normalizeSandboxPath("/workspace/move/sources.move"),
      (error: unknown) => error instanceof AppError && error.code === "VALIDATION_ERROR",
    );
  });

  it("rejects disallowed extensions and hidden env files", () => {
    assert.throws(
      () => normalizeSandboxPath("src/.env"),
      (error: unknown) => error instanceof AppError && error.code === "VALIDATION_ERROR",
    );
    assert.throws(
      () => normalizeSandboxPath("src/App.jsx"),
      (error: unknown) => error instanceof AppError && error.code === "VALIDATION_ERROR",
    );
  });

  it("allows read paths under /workspace/dist", () => {
    assert.equal(
      normalizeSandboxReadPath("/workspace/dist/index.html"),
      "/workspace/dist/index.html",
    );
    assert.equal(normalizeSandboxReadPath("dist/assets/app.js"), "/workspace/dist/assets/app.js");
  });

  it("validateArtifactBatch enforces max bytes and file count", () => {
    process.env.DEPLOY_MAX_ARTIFACT_BYTES = "10";
    resetSandboxConfigForTests();

    assert.throws(
      () => validateArtifactBatch([{ path: "src/App.tsx", content: "012345678901" }]),
      (error: unknown) => error instanceof AppError && error.code === "VALIDATION_ERROR",
    );

    process.env.DEPLOY_MAX_ARTIFACT_FILES = "1";
    resetSandboxConfigForTests();

    assert.throws(
      () =>
        validateArtifactBatch([
          { path: "src/App.tsx", content: "a" },
          { path: "src/main.tsx", content: "b" },
        ]),
      (error: unknown) => error instanceof AppError && error.code === "VALIDATION_ERROR",
    );
  });

  it("validateArtifactBatch rejects duplicate normalized paths", () => {
    assert.throws(
      () =>
        validateArtifactBatch([
          { path: "src/App.tsx", content: "a" },
          { path: "/workspace/src/App.tsx", content: "b" },
        ]),
      (error: unknown) => error instanceof AppError && error.code === "VALIDATION_ERROR",
    );
  });

  it("validateArtifactBatch returns normalized paths", () => {
    const result = validateArtifactBatch([{ path: "src/App.tsx", content: "ok" }]);
    assert.deepEqual(result, [{ path: "/workspace/src/App.tsx", content: "ok" }]);
  });

  it("validateMoveSourceBatch accepts move sources under /workspace/move/", () => {
    const result = validateMoveSourceBatch([
      { path: "move/package.move", content: "module pkg {}" },
    ]);
    assert.equal(result[0].path, "/workspace/move/package.move");
  });

  it("normalizeMoveSourcePath rejects artifact paths", () => {
    assert.throws(
      () => normalizeMoveSourcePath("src/App.tsx"),
      (error: unknown) => error instanceof AppError && error.code === "VALIDATION_ERROR",
    );
  });

  it("validateDistOutputBytes enforces max dist size", () => {
    process.env.DEPLOY_MAX_DIST_BYTES = "100";
    resetSandboxConfigForTests();

    assert.throws(
      () => validateDistOutputBytes(101),
      (error: unknown) => error instanceof AppError && error.code === "VALIDATION_ERROR",
    );
  });
});
