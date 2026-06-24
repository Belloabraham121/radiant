import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  denyDefaultAgentPermissions,
  defaultAgentPermissions,
} from "../../../src/services/agent/agent-permissions.service.js";

describe("agent-permissions.service deny defaults", () => {
  it("denyDefaultAgentPermissions disables auto-approve", () => {
    const permissions = denyDefaultAgentPermissions();
    assert.equal(permissions.auto_approve_enabled, false);
    assert.equal(permissions.auto_approve_max_sui, 0);
    assert.equal(permissions.allow_flash_loans, false);
    assert.equal(permissions.allow_governance, false);
  });

  it("defaultAgentPermissions remains permissive for explicit new-user defaults", () => {
    const permissions = defaultAgentPermissions();
    assert.equal(permissions.auto_approve_enabled, true);
  });
});
