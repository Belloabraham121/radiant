import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildLifiTrackingMeta } from "../../../../src/services/defi/lifi/lifi-tracking.js";
import type { LifiExecuteResult } from "../../../../src/services/defi/lifi/lifi.types.js";

describe("lifi-status-tracker", () => {
  it("builds poll input from tracking metadata", () => {
    const tracking = buildLifiTrackingMeta(
      {
        from_chain_id: "ethereum",
        to_chain_id: "ethereum",
        from_evm_chain_id: 1,
        to_evm_chain_id: 8453,
        bridges: ["stargate"],
      },
      {
        route_id: "route-1",
        tx_hashes: ["0xabc"],
        effects_status: "pending",
        pending_step: null,
        approval_tx_hash: null,
      } satisfies LifiExecuteResult,
    );

    assert.equal(tracking.tx_hashes[0], "0xabc");
    assert.equal(tracking.bridge_tool, "stargate");
  });
});
