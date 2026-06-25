import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { LifiExecuteResult } from "../../../../src/services/defi/lifi/lifi.types.js";
import {
  buildLifiTrackingMeta,
  isSameChainLifiRoute,
  isTerminalLifiStatus,
  mergeLifiStatusIntoTracking,
  readLifiTrackingFromTxResult,
  shouldEnqueueLifiCrossChainTracking,
  shouldEnqueueLifiSwapTracking,
  txResultFromLifiExecute,
} from "../../../../src/services/defi/lifi/lifi-tracking.js";

describe("lifi-tracking", () => {
  const executeResult: LifiExecuteResult = {
    route_id: "route-1",
    tx_hashes: ["0xabc"],
    effects_status: "pending",
    pending_step: null,
    approval_tx_hash: null,
  };

  const params = {
    from_chain_id: "ethereum",
    to_chain_id: "ethereum",
    from_evm_chain_id: 1,
    to_evm_chain_id: 8453,
    bridges: ["stargate"],
    estimated_duration_seconds: 120,
  };

  it("builds tracking metadata with ETA and bridge tool", () => {
    const tracking = buildLifiTrackingMeta(params, executeResult);
    assert.equal(tracking.route_id, "route-1");
    assert.equal(tracking.estimated_duration_seconds, 120);
    assert.equal(tracking.bridge_tool, "stargate");
    assert.equal(tracking.tracking_status, "PENDING");
    assert.ok(tracking.bridge_started_at);
  });

  it("sets bridge_started_at null when execute is not pending", () => {
    const tracking = buildLifiTrackingMeta(params, {
      ...executeResult,
      effects_status: "success",
    });
    assert.equal(tracking.bridge_started_at, null);
  });

  it("maps pending execute result to submitted tx result", () => {
    const tx = txResultFromLifiExecute({
      chain_id: "ethereum",
      address: "0xwallet",
      digest: "0xabc",
      evm_chain_id: 1,
      params,
      executeResult,
    });

    assert.equal(tx.effects_status, "pending");
    assert.equal(readLifiTrackingFromTxResult(tx)?.route_id, "route-1");
  });

  it("detects terminal Li-Fi statuses", () => {
    assert.equal(isTerminalLifiStatus("DONE"), true);
    assert.equal(isTerminalLifiStatus("PENDING"), false);
  });

  it("reads bridge_started_at from persisted tx result", () => {
    const tx = txResultFromLifiExecute({
      chain_id: "ethereum",
      address: "0xwallet",
      digest: "0xabc",
      evm_chain_id: 1,
      params,
      executeResult,
    });
    const tracking = readLifiTrackingFromTxResult(tx);
    assert.ok(tracking?.bridge_started_at);

    const roundTrip = readLifiTrackingFromTxResult({
      ...tx,
      lifi: { ...tracking!, bridge_started_at: "2026-01-01T00:00:00.000Z" },
    });
    assert.equal(roundTrip?.bridge_started_at, "2026-01-01T00:00:00.000Z");
  });

  it("preserves bridge_started_at when merging polled status", () => {
    const tracking = buildLifiTrackingMeta(params, executeResult);
    const merged = mergeLifiStatusIntoTracking(tracking, {
      status: "DONE",
      substatus: "COMPLETED",
      substatus_message: "Transfer complete",
      tx_hash: "0xabc",
      from_chain_id: "ethereum",
      to_chain_id: "ethereum",
      from_lifi_chain_id: 1,
      to_lifi_chain_id: 8453,
      from_evm_chain_id: 1,
      to_evm_chain_id: 8453,
      receiving_tx_hash: "0xdest",
      tool: "stargate",
      raw: {} as never,
    });

    assert.equal(merged.tracking_status, "DONE");
    assert.equal(merged.receiving_tx_hash, "0xdest");
    assert.equal(merged.bridge_started_at, tracking.bridge_started_at);
  });

  it("detects same-chain Li-Fi routes", () => {
    const sameChain = buildLifiTrackingMeta(
      {
        from_chain_id: "ethereum",
        to_chain_id: "ethereum",
        from_evm_chain_id: 8453,
        to_evm_chain_id: 8453,
      },
      executeResult,
    );
    assert.equal(isSameChainLifiRoute(sameChain), true);

    const crossChain = buildLifiTrackingMeta(params, executeResult);
    assert.equal(isSameChainLifiRoute(crossChain), false);
  });

  it("routes swap vs cross-chain enqueue explicitly", () => {
    const sameChainParams = {
      from_chain_id: "ethereum",
      to_chain_id: "ethereum",
      from_evm_chain_id: 8453,
      to_evm_chain_id: 8453,
    };
    const tracking = buildLifiTrackingMeta(sameChainParams, executeResult);
    const pendingTx = txResultFromLifiExecute({
      chain_id: "ethereum",
      address: "0xwallet",
      digest: "0xabc",
      evm_chain_id: 8453,
      params: sameChainParams,
      executeResult,
    });

    assert.equal(shouldEnqueueLifiSwapTracking(pendingTx, tracking), true);
    assert.equal(shouldEnqueueLifiCrossChainTracking(pendingTx, tracking), false);

    const successResult = txResultFromLifiExecute({
      chain_id: "ethereum",
      address: "0xwallet",
      digest: "0xabc",
      evm_chain_id: 8453,
      params: sameChainParams,
      executeResult: { ...executeResult, effects_status: "success" },
    });
    assert.equal(shouldEnqueueLifiSwapTracking(successResult, tracking), true);
    assert.equal(shouldEnqueueLifiCrossChainTracking(successResult, tracking), false);

    const crossChainTracking = buildLifiTrackingMeta(params, executeResult);
    const crossChainPending = txResultFromLifiExecute({
      chain_id: "ethereum",
      address: "0xwallet",
      digest: "0xabc",
      evm_chain_id: 1,
      params,
      executeResult,
    });
    assert.equal(shouldEnqueueLifiCrossChainTracking(crossChainPending, crossChainTracking), true);
    assert.equal(shouldEnqueueLifiSwapTracking(crossChainPending, crossChainTracking), false);

    assert.equal(
      shouldEnqueueLifiCrossChainTracking(
        { ...successResult, effects_status: "success" },
        crossChainTracking,
      ),
      false,
    );
    assert.equal(
      shouldEnqueueLifiSwapTracking(
        { ...successResult, effects_status: "success" },
        crossChainTracking,
      ),
      false,
    );
  });
});
