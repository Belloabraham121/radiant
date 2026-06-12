import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildUnsupportedCapabilityNudge,
  detectUnsupportedCapability,
  isUnsupportedCapabilityNudge,
} from "../../../src/services/agent/unsupported-capabilities.js";

describe("unsupported-capabilities", () => {
  it("detects open orders requests", () => {
    const cap = detectUnsupportedCapability("Show my open orders on DeepBook.");
    assert.equal(cap?.id, "open_orders");
  });

  it("detects limit order placement", () => {
    const cap = detectUnsupportedCapability(
      "Place a limit order to buy SUI at 2 USDC on DeepBook.",
    );
    assert.equal(cap?.id, "place_limit_order");
  });

  it("does not flag supported swap requests", () => {
    assert.equal(detectUnsupportedCapability("Swap 1 SUI to USDC"), null);
    assert.equal(detectUnsupportedCapability("What is the SUI_USDC price?"), null);
  });

  it("nudge forbids fake empty order lists", () => {
    const nudge = buildUnsupportedCapabilityNudge({
      id: "open_orders",
      label: "viewing open orders",
      pattern: /open orders/i,
    });
    assert.match(nudge, /NOT support this in chat yet/i);
    assert.match(nudge, /Do not say the list is empty/i);
    assert.equal(isUnsupportedCapabilityNudge(nudge), true);
  });
});
