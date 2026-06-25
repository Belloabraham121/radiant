import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  ensureBridgeStartedAt,
  formatLifiStaticEtaLabel,
  lifiBridgeStepLabel,
  lifiCountdownKind,
  lifiCountdownStepFields,
  lifiCountdownVerb,
} from "../../../../src/services/defi/lifi/lifi-countdown.js";
import type { LifiTrackingMeta } from "../../../../src/services/defi/lifi/lifi-tracking.types.js";

function baseTracking(overrides: Partial<LifiTrackingMeta> = {}): LifiTrackingMeta {
  return {
    route_id: "route-1",
    tx_hashes: ["0xabc"],
    from_chain_id: "ethereum",
    to_chain_id: "ethereum",
    from_evm_chain_id: 1,
    to_evm_chain_id: 8453,
    bridge_tool: "stargate",
    estimated_duration_seconds: 1200,
    bridge_started_at: null,
    tracking_status: "PENDING",
    substatus: null,
    substatus_message: null,
    receiving_tx_hash: null,
    ...overrides,
  };
}

describe("lifi-countdown", () => {
  it("classifies cross-chain routes as bridge and same-chain as swap", () => {
    assert.equal(lifiCountdownKind(baseTracking()), "bridge");
    assert.equal(
      lifiCountdownKind(
        baseTracking({ from_evm_chain_id: 1, to_evm_chain_id: 1 }),
      ),
      "swap",
    );
  });

  it("returns progress, done, and failed verbs", () => {
    assert.equal(lifiCountdownVerb("bridge", "progress"), "Bridging");
    assert.equal(lifiCountdownVerb("bridge", "done"), "Bridged");
    assert.equal(lifiCountdownVerb("swap", "progress"), "Swapping");
    assert.equal(lifiCountdownVerb("swap", "failed"), "Swap failed");
  });

  it("formats static ETA fallback labels", () => {
    assert.equal(formatLifiStaticEtaLabel(45, "bridge"), "Bridging (~45s)");
    assert.equal(formatLifiStaticEtaLabel(120, "swap"), "Swapping (~2m)");
    assert.equal(formatLifiStaticEtaLabel(null, "bridge"), "Bridging");
  });

  it("sets bridge_started_at when missing", () => {
    const tracking = baseTracking({ bridge_started_at: null });
    const next = ensureBridgeStartedAt(tracking);
    assert.ok(next.bridge_started_at);
    assert.equal(ensureBridgeStartedAt(next), next);
  });

  it("emits countdown step fields from tracking", () => {
    const tracking = baseTracking({
      bridge_started_at: "2026-01-01T00:00:00.000Z",
    });
    assert.deepEqual(lifiCountdownStepFields(tracking), {
      estimated_duration_seconds: 1200,
      bridge_started_at: "2026-01-01T00:00:00.000Z",
      countdown_kind: "bridge",
    });
  });

  it("uses verb-only label when countdown anchor is present", () => {
    const tracking = baseTracking({
      bridge_started_at: "2026-01-01T00:00:00.000Z",
    });
    assert.equal(lifiBridgeStepLabel(tracking, "running"), "Bridging");
    assert.equal(
      lifiBridgeStepLabel(baseTracking(), "running"),
      "Bridging (~20m)",
    );
    assert.equal(lifiBridgeStepLabel(tracking, "done"), "Bridged");
  });
});
