import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import {
  MAX_SOROSWAP_POLL_ATTEMPTS,
  runSoroswapTrackPollLoop,
  soroswapPollDelayMs,
} from "../../../../src/inngest/functions/soroswap-track-poll.js";
import {
  setSoroswapStatusTrackerHooksForTests,
} from "../../../../src/services/defi/soroswap/soroswap-status-tracker.service.js";
import type { SoroswapTrackJobInput } from "../../../../src/services/defi/soroswap/soroswap-tracking.types.js";

describe("soroswap-track-poll", () => {
  afterEach(() => {
    setSoroswapStatusTrackerHooksForTests(null);
  });

  it("soroswapPollDelayMs increases with attempt index", () => {
    assert.equal(soroswapPollDelayMs(0), "10s");
    assert.equal(soroswapPollDelayMs(5), "12s");
    assert.equal(soroswapPollDelayMs(100), "60s");
  });

  it("runSoroswapTrackPollLoop stops at terminal status", async () => {
    const input: SoroswapTrackJobInput = {
      transactionId: "tx-1",
      sessionId: null,
      privyUserId: "user-1",
      txHash: "hash-1",
    };

    let pollCalls = 0;
    const step = {
      run: async (_id: string, fn: () => Promise<unknown>) => fn(),
      sleep: async () => undefined,
    };

    setSoroswapStatusTrackerHooksForTests({
      pollOnce: async () => {
        pollCalls += 1;
        return {
          tx_hash: "hash-1",
          status: pollCalls === 1 ? ("pending" as const) : ("success" as const),
        };
      },
      findTransaction: async () => ({
        id: "tx-1",
        chain_id: "stellar",
        digest: "hash-1",
        result: null,
        status: "submitted",
      }),
      updateProgress: async () => null,
      markTerminal: async () => null,
    });

    const result = await runSoroswapTrackPollLoop(step, input);

    assert.equal(result.terminal, true);
    assert.equal(result.status, "success");
    assert.equal(pollCalls, 2);
  });

  it("runSoroswapTrackPollLoop returns transaction_missing when row absent", async () => {
    setSoroswapStatusTrackerHooksForTests({
      pollOnce: async () => ({ tx_hash: "hash-1", status: "pending" }),
      findTransaction: async () => null,
    });

    const step = {
      run: async (_id: string, fn: () => Promise<unknown>) => fn(),
      sleep: async () => undefined,
    };

    const result = await runSoroswapTrackPollLoop(step, {
      transactionId: "missing",
      sessionId: null,
      privyUserId: "user-1",
      txHash: "hash-1",
    });

    assert.equal(result.terminal, true);
    assert.equal(result.reason, "transaction_missing");
  });

  it("MAX_SOROSWAP_POLL_ATTEMPTS matches squid/lifi budget", () => {
    assert.equal(MAX_SOROSWAP_POLL_ATTEMPTS, 120);
  });
});
