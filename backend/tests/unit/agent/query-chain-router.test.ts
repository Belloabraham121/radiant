import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getCoreQueryHandler } from "../../../src/services/agent/chains/core/queries.js";
import { resolveQueryHandler } from "../../../src/services/agent/chains/registry.js";
import { runDeepBookQuery } from "../../../src/services/agent/chains/sui/deepbook/query-handlers.js";

describe("query-chain router", () => {
  it("dispatches balance to core handler", () => {
    const handler = resolveQueryHandler("stellar", "balance");
    assert.equal(handler, getCoreQueryHandler("balance"));
  });

  it("dispatches deepbook_pools to sui handler", () => {
    const handler = resolveQueryHandler("sui", "deepbook_pools");
    assert.equal(handler, runDeepBookQuery);
  });

  it("returns null for deepbook_pools on stellar", () => {
    const handler = resolveQueryHandler("stellar", "deepbook_pools");
    assert.equal(handler, null);
  });
});
