import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  agentPermissionsFromUser,
  resolveAutoApproveMaxDisplay,
} from "../../../src/services/agent/agent-permissions.service.js";

describe("agent-permissions.service", () => {
  it("maps user row to permissions", () => {
    const permissions = agentPermissionsFromUser({
      agent_auto_approve_enabled: false,
      agent_auto_approve_max_sui: 100,
    });
    assert.equal(permissions.auto_approve_enabled, false);
    assert.equal(permissions.auto_approve_max_sui, 100);
  });

  it("resolveAutoApproveMaxDisplay uses user SUI threshold", () => {
    const permissions = { auto_approve_enabled: true, auto_approve_max_sui: 42 };
    assert.equal(resolveAutoApproveMaxDisplay(permissions, "sui"), 42);
  });
});
