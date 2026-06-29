import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { applyJsonPatch } from "../../../src/services/canvas/build/apply-json-patch.js";

describe("applyJsonPatch", () => {
  it("replaces nested config values", () => {
    const doc = { config: { pair: "ETH/USD", interval: "1h" } };
    const result = applyJsonPatch(doc, [
      { op: "replace", path: "/config/pair", value: "BTC/USD" },
    ]);
    assert.deepEqual(result.config.pair, "BTC/USD");
    assert.equal(result.config.interval, "1h");
  });

  it("adds new config keys", () => {
    const doc = { config: { pair: "BTC/USD" } };
    const result = applyJsonPatch(doc, [
      { op: "add", path: "/config/interval", value: "4h" },
    ]);
    assert.deepEqual(result.config, { pair: "BTC/USD", interval: "4h" });
  });

  it("removes config keys", () => {
    const doc = { config: { pair: "BTC/USD", interval: "1h" } };
    const result = applyJsonPatch(doc, [{ op: "remove", path: "/config/interval" }]);
    assert.deepEqual(result.config, { pair: "BTC/USD" });
  });

  it("does not mutate the original document", () => {
    const doc = { config: { pair: "BTC/USD" } };
    applyJsonPatch(doc, [{ op: "replace", path: "/config/pair", value: "SOL/USD" }]);
    assert.equal(doc.config.pair, "BTC/USD");
  });
});
