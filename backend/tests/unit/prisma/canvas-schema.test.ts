import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import {
  CanvasBuildMessageRole,
  CanvasWorkflowRunMode,
  CanvasWorkflowRunStatus,
  CanvasWorkflowRuntimeStatus,
  CanvasWorkflowStatus,
} from "@prisma/client";

const __dirname = dirname(fileURLToPath(import.meta.url));
const migrationPath = join(
  __dirname,
  "../../../prisma/migrations/20260629120000_add_canvas_workflows/migration.sql",
);

describe("canvas workflow prisma schema", () => {
  it("exports canvas workflow enums from @prisma/client", () => {
    assert.equal(CanvasWorkflowStatus.draft, "draft");
    assert.equal(CanvasWorkflowStatus.live, "live");
    assert.equal(CanvasWorkflowRunMode.dry, "dry");
    assert.equal(CanvasWorkflowRunMode.live, "live");
    assert.equal(CanvasWorkflowRunStatus.running, "running");
    assert.equal(CanvasWorkflowRunStatus.cancelled, "cancelled");
    assert.equal(CanvasWorkflowRuntimeStatus.active, "active");
    assert.equal(CanvasWorkflowRuntimeStatus.stopped, "stopped");
    assert.equal(CanvasBuildMessageRole.user, "user");
    assert.equal(CanvasBuildMessageRole.assistant, "assistant");
  });

  it("includes the add_canvas_workflows migration", () => {
    assert.ok(existsSync(migrationPath));
  });
});
