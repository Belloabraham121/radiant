import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Project } from "@prisma/client";
import { listAppActionsCatalogForProject } from "../../../src/services/projects/app-action-catalog.service.js";
import { buildDefaultDeepBookActionSchema } from "../../../src/services/projects/app-action-schema.service.js";
import { PROJECT_ACTION_SCHEMA_VERSION } from "../../../src/services/projects/app-action-schema.types.js";

describe("app-action catalog", () => {
  it("returns per-project schema with registry metadata", () => {
    const projectId = "55555555-5555-4555-8555-555555555555";
    const project = {
      id: projectId,
      template: "swap",
      action_schema: buildDefaultDeepBookActionSchema(projectId),
    } as Project;

    const catalog = listAppActionsCatalogForProject(project);

    assert.equal(catalog.schema_version, PROJECT_ACTION_SCHEMA_VERSION);
    assert.equal(catalog.app_id, projectId);
    assert.equal(catalog.protocol, "deepbook");
    assert.ok(catalog.actions.length > 0);
    for (const entry of catalog.actions) {
      assert.ok(entry.description.length > 0);
      assert.ok(entry.execute_action.length > 0);
      assert.ok(Array.isArray(entry.params));
    }

    const swap = catalog.actions.find((entry) => entry.name === "swap");
    assert.ok(swap);
    assert.ok(swap?.params.some((field) => field.name === "side"));
  });

  it("returns empty custom schema for non-DeFi projects", () => {
    const projectId = "66666666-6666-4666-8666-666666666666";
    const project = {
      id: projectId,
      template: "custom",
      action_schema: null,
    } as Project;

    const catalog = listAppActionsCatalogForProject(project);
    assert.equal(catalog.protocol, "custom");
    assert.equal(catalog.actions.length, 0);
  });
});
