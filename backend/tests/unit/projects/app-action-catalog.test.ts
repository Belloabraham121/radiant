import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { listAppActionsCatalog } from "../../../src/services/projects/app-action-catalog.service.js";
import { APP_ACTION_NAMES } from "../../../src/services/projects/app-action-registry.js";

describe("app-action catalog", () => {
  it("lists all registry actions with param docs", () => {
    const catalog = listAppActionsCatalog();

    assert.equal(catalog.actions.length, APP_ACTION_NAMES.length);
    for (const entry of catalog.actions) {
      assert.ok(APP_ACTION_NAMES.includes(entry.name as (typeof APP_ACTION_NAMES)[number]));
      assert.ok(entry.description.length > 0);
      assert.ok(entry.execute_action.length > 0);
      assert.ok(Array.isArray(entry.params.fields));
    }

    const provision = catalog.actions.find((entry) => entry.name === "provision_manager");
    assert.ok(provision);
    assert.equal(provision?.params.fields.length, 0);
  });
});
