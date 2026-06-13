import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  agentPermissionsFromUser,
  defaultAgentPermissions,
  resolveAutoApproveMaxDisplay,
} from "../../../src/services/agent/agent-permissions.service.js";

describe("agent-permissions.service", () => {
  it("maps user row to permissions", () => {
    const permissions = agentPermissionsFromUser({
      agent_auto_approve_enabled: false,
      agent_auto_approve_max_sui: 100,
      agent_allow_flash_loans: true,
      agent_auto_approve_flash_loans: true,
      agent_allow_governance: true,
    });
    assert.equal(permissions.auto_approve_enabled, false);
    assert.equal(permissions.auto_approve_max_sui, 100);
    assert.equal(permissions.allow_flash_loans, true);
    assert.equal(permissions.auto_approve_flash_loans, true);
    assert.equal(permissions.allow_governance, true);
  });

  it("defaults governance permission to false", () => {
    const permissions = defaultAgentPermissions();
    assert.equal(permissions.allow_governance, false);
  });

  it("resolveAutoApproveMaxDisplay uses user SUI threshold", () => {
    const permissions = { ...defaultAgentPermissions(), auto_approve_max_sui: 42 };
    assert.equal(resolveAutoApproveMaxDisplay(permissions, "sui"), 42);
  });
});
