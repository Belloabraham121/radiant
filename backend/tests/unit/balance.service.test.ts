import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { mistToSui } from "../../src/services/wallet/balance.service.js";

describe("mistToSui", () => {
  it("converts mist to SUI", () => {
    assert.equal(mistToSui(1_000_000_000n), 1);
    assert.equal(mistToSui(0n), 0);
  });
});
