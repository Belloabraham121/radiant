import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { getDefaultAutoApproveMaxUsd } from "../../../src/config/agent.js";

describe("agent config", () => {
  afterEach(() => {
    delete process.env.AGENT_AUTO_APPROVE_MAX_USD;
  });

  it("getDefaultAutoApproveMaxUsd defaults to 25", () => {
    assert.equal(getDefaultAutoApproveMaxUsd(), 25);
  });

  it("getDefaultAutoApproveMaxUsd clamps env above API max", () => {
    process.env.AGENT_AUTO_APPROVE_MAX_USD = "5000000";
    assert.equal(getDefaultAutoApproveMaxUsd(), 1_000_000);
  });

  it("getDefaultAutoApproveMaxUsd rejects invalid env", () => {
    process.env.AGENT_AUTO_APPROVE_MAX_USD = "not-a-number";
    assert.equal(getDefaultAutoApproveMaxUsd(), 25);
  });
});
