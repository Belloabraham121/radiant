import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  agentPermissionsFromUser,
  approvalThresholdLabel,
  defaultAgentPermissions,
  resolveAutoApproveMaxUsd,
  usdValueRequiresApproval,
} from "../../../src/services/agent/agent-permissions.service.js";

describe("agent-permissions.service", () => {
  it("maps user row to permissions", () => {
    const permissions = agentPermissionsFromUser({
      agent_auto_approve_enabled: false,
      agent_auto_approve_max_usd: 100,
      agent_allow_flash_loans: true,
      agent_auto_approve_flash_loans: true,
      agent_allow_governance: true,
    });
    assert.equal(permissions.auto_approve_enabled, false);
    assert.equal(permissions.auto_approve_max_usd, 100);
    assert.equal(permissions.allow_flash_loans, true);
    assert.equal(permissions.auto_approve_flash_loans, true);
    assert.equal(permissions.allow_governance, true);
  });

  it("defaults governance permission to false", () => {
    const permissions = defaultAgentPermissions();
    assert.equal(permissions.allow_governance, false);
  });

  it("resolveAutoApproveMaxUsd uses user USD threshold", () => {
    const permissions = { ...defaultAgentPermissions(), auto_approve_max_usd: 42 };
    assert.equal(resolveAutoApproveMaxUsd(permissions), 42);
  });

  it("approvalThresholdLabel formats USD", () => {
    const permissions = { ...defaultAgentPermissions(), auto_approve_max_usd: 10 };
    assert.equal(approvalThresholdLabel(permissions), "$10");
  });

  it("usdValueRequiresApproval fails safe when price unknown", () => {
    assert.equal(usdValueRequiresApproval(defaultAgentPermissions(), null), true);
  });

  it("usdValueRequiresApproval auto-approves at threshold", () => {
    const permissions = { ...defaultAgentPermissions(), auto_approve_max_usd: 25 };
    assert.equal(usdValueRequiresApproval(permissions, 25), false);
    assert.equal(usdValueRequiresApproval(permissions, 25.01), true);
  });
});
