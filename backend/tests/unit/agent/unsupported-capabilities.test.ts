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

  it("detects flash loans", () => {
    assert.equal(detectUnsupportedCapability("Get me a flash loan on DeepBook")?.id, "flash_loan");
  });

  it("nudge forbids fake empty results for unsupported features", () => {
    const nudge = buildUnsupportedCapabilityNudge({
      id: "flash_loan",
      label: "flash loans",
      pattern: /flash loan/i,
    });
    assert.match(nudge, /NOT support this in chat yet/i);
    assert.match(nudge, /Do not say the list is empty/i);
    assert.equal(isUnsupportedCapabilityNudge(nudge), true);
  });
});
