import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { inferStatusCategoryFromStep } from "../../src/lib/agent-status-category";

describe("cross-chain stream step mapping", () => {
  it("infers defi status category for liquidity_fallback_offered and squid_quote", () => {
    assert.equal(
      inferStatusCategoryFromStep({
        id: "liquidity_fallback_offered",
        status: "running",
        label: "Finding another route…",
      }),
      "defi",
    );
    assert.equal(
      inferStatusCategoryFromStep({
        id: "squid_quote",
        status: "running",
        label: "Getting alternate route…",
      }),
      "defi",
    );
    assert.equal(
      inferStatusCategoryFromStep({
        id: "fallback-offer",
        status: "pending",
        label: "Finding another route…",
      }),
      "defi",
    );
    assert.equal(
      inferStatusCategoryFromStep({
        id: "stellar_routing_fallback_offered",
        status: "running",
        label: "Checking Stellar option…",
      }),
      "defi",
    );
    assert.equal(
      inferStatusCategoryFromStep({
        id: "soroswap_quote",
        status: "running",
        label: "Getting Stellar quote…",
      }),
      "defi",
    );
  });
});
