import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Project } from "@prisma/client";
import { AppError } from "../../../src/errors/app-error.js";
import {
  assertActionInProjectSchema,
  callAppActionInputSchema,
} from "../../../src/services/projects/call-app-action.tool.js";
import { buildDefaultDeepBookActionSchema } from "../../../src/services/projects/app-action-schema.service.js";
import {
  coerceMislabeledAppScopeFields,
  isUuid,
} from "../../../src/services/projects/app-scope-resolver.service.js";

const projectId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

describe("call_app_action tool", () => {
  it("accepts app_name without project_id or installation_id", () => {
    const parsed = callAppActionInputSchema.parse({
      app_name: "Uniswap",
      action: "swap",
      params: { amount: 1, side: "sell" },
    });
    assert.equal(parsed.app_name, "Uniswap");
    assert.equal(parsed.action, "swap");
  });

  it("coerces mislabeled app names from project_id to app_name", () => {
    const coerced = coerceMislabeledAppScopeFields({
      project_id: "uniswap",
      action: "swap",
      params: { amount: 1, side: "sell" },
    });
    assert.equal(coerced.app_name, "uniswap");
    assert.equal(coerced.project_id, undefined);

    const parsed = callAppActionInputSchema.parse(coerced);
    assert.equal(parsed.app_name, "uniswap");
  });

  it("rejects both project_id and installation_id", () => {
    assert.throws(() =>
      callAppActionInputSchema.parse({
        project_id: projectId,
        installation_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        action: "swap",
        params: { amount: 1, side: "sell" },
      }),
    );
  });

  it("isUuid validates project ids", () => {
    assert.equal(isUuid(projectId), true);
    assert.equal(isUuid("uniswap"), false);
  });

  it("assertActionInProjectSchema allows actions listed in project schema", () => {
    const project = {
      id: projectId,
      template: "swap",
      action_schema: buildDefaultDeepBookActionSchema(projectId, ["swap", "stake"]),
    } as Project;

    assert.doesNotThrow(() => assertActionInProjectSchema(project, "swap"));
    assert.doesNotThrow(() => assertActionInProjectSchema(project, "stake"));
  });

  it("assertActionInProjectSchema rejects actions not in project schema", () => {
    const project = {
      id: projectId,
      template: "custom",
      action_schema: buildDefaultDeepBookActionSchema(projectId, ["swap"]),
    } as Project;

    assert.throws(
      () => assertActionInProjectSchema(project, "flash_loan"),
      (err: unknown) =>
        err instanceof AppError &&
        err.code === "ACTION_NOT_IN_SCHEMA" &&
        Array.isArray((err.details as { allowed_actions?: string[] })?.allowed_actions),
    );
  });

  it("callAppActionInputSchema rejects invalid action names", () => {
    assert.throws(() =>
      callAppActionInputSchema.parse({
        project_id: projectId,
        action: "not_a_real_action",
        params: {},
      }),
    );
  });
});
