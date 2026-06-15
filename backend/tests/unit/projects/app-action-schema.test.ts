import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildDefaultDeepBookActionSchema,
  buildProjectActionsCatalogResponse,
  detectDefiActionNamesFromArtifact,
  inferProjectActionSchemaForArtifact,
  parseStoredProjectActionSchema,
  shouldPersistDefiActionSchema,
} from "../../../src/services/projects/app-action-schema.service.js";
import { PROJECT_ACTION_SCHEMA_VERSION } from "../../../src/services/projects/app-action-schema.types.js";
import type { Project } from "@prisma/client";

describe("app-action schema", () => {
  it("buildDefaultDeepBookActionSchema includes swap params", () => {
    const projectId = "11111111-1111-4111-8111-111111111111";
    const schema = buildDefaultDeepBookActionSchema(projectId);

    assert.equal(schema.schema_version, PROJECT_ACTION_SCHEMA_VERSION);
    assert.equal(schema.app_id, projectId);
    assert.equal(schema.protocol, "deepbook");
    assert.ok(schema.actions.some((action) => action.name === "swap"));
    const swap = schema.actions.find((action) => action.name === "swap");
    assert.ok(swap?.params.some((field) => field.name === "side"));
  });

  it("detects DeFi helpers from artifact source", () => {
    const names = detectDefiActionNamesFromArtifact(
      [
        {
          path: "components/SwapForm.tsx",
          content:
            'import { executeSwap, executeStake } from "../lib/radiant-client";\nawait executeSwap({ side: "sell", amount_display: 1 });',
        },
      ],
      "custom",
    );

    assert.ok(names.includes("swap"));
    assert.ok(names.includes("stake"));
  });

  it("persists schema when DeFi helpers are in generated files", () => {
    const projectId = "22222222-2222-4222-8222-222222222222";

    const defiSchema = inferProjectActionSchemaForArtifact(projectId, {
      template: "custom",
      files: [
        {
          path: "components/SwapForm.tsx",
          content:
            'import { executeSwap } from "../lib/radiant-client";\nexport default function SwapForm() { return null; }',
        },
      ],
    });
    assert.ok(defiSchema);
    assert.equal(defiSchema?.protocol, "deepbook");

    const emptySchema = inferProjectActionSchemaForArtifact(projectId, {
      template: "swap",
      files: [{ path: "app/page.tsx", content: "export default function Page() { return null; }" }],
    });
    assert.equal(emptySchema, null);
    assert.equal(
      shouldPersistDefiActionSchema({
        template: "custom",
        files: [{ path: "app/page.tsx", content: "hello" }],
      }),
      false,
    );
  });

  it("buildProjectActionsCatalogResponse uses stored schema when valid", () => {
    const projectId = "33333333-3333-4333-8333-333333333333";
    const stored = buildDefaultDeepBookActionSchema(projectId, ["swap", "stake"]);

    const project = {
      id: projectId,
      template: "custom",
      action_schema: stored,
    } as Project;

    const catalog = buildProjectActionsCatalogResponse(project);
    assert.equal(catalog.schema_version, PROJECT_ACTION_SCHEMA_VERSION);
    assert.equal(catalog.app_id, projectId);
    assert.equal(catalog.actions.length, 2);
    assert.equal(catalog.actions[0]?.execute_action, "swap");
    assert.ok(parseStoredProjectActionSchema(stored));
  });

  it("infers swap template actions when schema not persisted yet", () => {
    const projectId = "44444444-4444-4444-8444-444444444444";
    const project = {
      id: projectId,
      template: "swap",
      action_schema: null,
    } as Project;

    const catalog = buildProjectActionsCatalogResponse(project);
    assert.equal(catalog.protocol, "deepbook");
    assert.ok(catalog.actions.some((action) => action.name === "swap"));
    assert.ok(catalog.actions.some((action) => action.name === "stake"));
  });
});
