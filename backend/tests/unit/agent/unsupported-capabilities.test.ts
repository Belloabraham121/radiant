import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildUnsupportedCapabilityNudge,
  detectUnsupportedCapability,
  isUnsupportedCapabilityNudge,
} from "../../../src/services/agent/unsupported-capabilities.js";

describe("unsupported-capabilities", () => {
  it("does not flag supported order requests", () => {
    assert.equal(detectUnsupportedCapability("Show my open orders on DeepBook."), null);
    assert.equal(
      detectUnsupportedCapability("Place a limit order to buy SUI at 2 USDC on DeepBook."),
      null,
    );
    assert.equal(detectUnsupportedCapability("Cancel all my orders"), null);
  });

  it("does not flag supported swap requests", () => {
    assert.equal(detectUnsupportedCapability("Swap 1 SUI to USDC"), null);
    assert.equal(detectUnsupportedCapability("What is the SUI_USDC price?"), null);
  });

  it("does not flag supported flash loan requests", () => {
    assert.equal(detectUnsupportedCapability("Get me a flash loan on DeepBook"), null);
  });

  it("does not flag supported stake requests", () => {
    assert.equal(detectUnsupportedCapability("Stake 100 DEEP on SUI_USDC"), null);
    assert.equal(detectUnsupportedCapability("How much DEEP do I have staked?"), null);
    assert.equal(detectUnsupportedCapability("Unstake my DEEP from DeepBook"), null);
  });

  it("nudge forbids fake empty results for unsupported features", () => {
    const nudge = buildUnsupportedCapabilityNudge({
      id: "governance",
      label: "governance voting",
      pattern: /governance/i,
    });
    assert.match(nudge, /NOT support this in chat yet/i);
    assert.match(nudge, /Do not say the list is empty/i);
    assert.equal(isUnsupportedCapabilityNudge(nudge), true);
  });
});
