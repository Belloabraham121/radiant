import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import {
  applySoroswapStatusUpdate,
  pollSoroswapSwapOnce,
  setSoroswapStatusTrackerHooksForTests,
} from "../../../../src/services/defi/soroswap/soroswap-status-tracker.service.js";
import {
  setSoroswapStatusHorizonHookForTests,
} from "../../../../src/services/defi/soroswap/soroswap-status.service.js";

describe("soroswap-status-tracker.service", () => {
  afterEach(() => {
    setSoroswapStatusHorizonHookForTests(null);
    setSoroswapStatusTrackerHooksForTests(null);
  });

  it("pollSoroswapSwapOnce delegates to getSoroswapSwapStatus", async () => {
    setSoroswapStatusHorizonHookForTests(async () => ({
      successful: true,
      ledger: 100,
    }));

    const status = await pollSoroswapSwapOnce("hash-1");
    assert.equal(status.status, "success");
    assert.equal(status.tx_hash, "hash-1");
  });

  it("applySoroswapStatusUpdate marks pending progress for non-terminal status", async () => {
    const updates: Array<{ effects_status: string; terminal?: boolean }> = [];
    setSoroswapStatusTrackerHooksForTests({
      updateProgress: async (_transactionId, input) => {
        updates.push({ effects_status: input.effects_status });
        return null;
      },
      markTerminal: async () => {
        throw new Error("should not mark terminal");
      },
    });

    const outcome = await applySoroswapStatusUpdate({
      transactionId: "tx-1",
      sessionId: null,
      chainId: "stellar",
      digest: "hash-1",
      txHash: "hash-1",
      status: { tx_hash: "hash-1", status: "pending" },
    });

    assert.equal(outcome.terminal, false);
    assert.equal(updates.length, 1);
    assert.equal(updates[0]?.effects_status, "pending");
  });

  it("applySoroswapStatusUpdate marks terminal success", async () => {
    const terminals: Array<{ status: string; effects_status: string }> = [];
    setSoroswapStatusTrackerHooksForTests({
      updateProgress: async () => null,
      markTerminal: async (_transactionId, input) => {
        terminals.push({
          status: input.status,
          effects_status: input.effects_status,
        });
        return null;
      },
    });

    const outcome = await applySoroswapStatusUpdate({
      transactionId: "tx-2",
      sessionId: "session-1",
      chainId: "stellar",
      digest: "hash-2",
      txHash: "hash-2",
      status: { tx_hash: "hash-2", status: "success", ledger: 200 },
      quoteId: "soroswap:abc",
    });

    assert.equal(outcome.terminal, true);
    assert.equal(terminals.length, 1);
    assert.equal(terminals[0]?.status, "success");
    assert.equal(terminals[0]?.effects_status, "success");
  });

  it("applySoroswapStatusUpdate marks terminal failure", async () => {
    const terminals: Array<{ status: string }> = [];
    setSoroswapStatusTrackerHooksForTests({
      updateProgress: async () => null,
      markTerminal: async (_transactionId, input) => {
        terminals.push({ status: input.status });
        return null;
      },
    });

    const outcome = await applySoroswapStatusUpdate({
      transactionId: "tx-3",
      sessionId: null,
      chainId: "stellar",
      digest: "hash-3",
      txHash: "hash-3",
      status: { tx_hash: "hash-3", status: "failed" },
    });

    assert.equal(outcome.terminal, true);
    assert.equal(terminals[0]?.status, "failure");
  });
});
