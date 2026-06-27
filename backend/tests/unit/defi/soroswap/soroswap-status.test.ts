import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import {
  normalizeSoroswapEffectsStatus,
  normalizeSoroswapTrackingStatus,
  normalizeSoroswapTxStatus,
} from "../../../../src/services/defi/soroswap/soroswap-normalize.js";
import {
  getSoroswapSwapStatus,
  setSoroswapStatusHorizonHookForTests,
} from "../../../../src/services/defi/soroswap/soroswap-status.service.js";
import { AppError } from "../../../../src/errors/app-error.js";

describe("soroswap-normalize status helpers", () => {
  it("maps Horizon successful tx to success", () => {
    assert.equal(normalizeSoroswapTxStatus({ successful: true, ledger: 100 }), "success");
    assert.equal(normalizeSoroswapEffectsStatus("success"), "success");
    assert.equal(normalizeSoroswapTrackingStatus("success"), "success");
  });

  it("maps failed Horizon tx to failed", () => {
    assert.equal(normalizeSoroswapTxStatus({ successful: false, ledger: 101 }), "failed");
    assert.equal(normalizeSoroswapEffectsStatus("failed"), "failure");
    assert.equal(normalizeSoroswapTrackingStatus("failed"), "failed");
  });

  it("maps missing Horizon tx to pending", () => {
    assert.equal(normalizeSoroswapTxStatus(null), "pending");
    assert.equal(normalizeSoroswapTxStatus(undefined), "pending");
    assert.equal(normalizeSoroswapEffectsStatus("pending"), "pending");
  });
});

describe("soroswap-status.service", () => {
  afterEach(() => {
    setSoroswapStatusHorizonHookForTests(null);
  });

  it("rejects empty tx hash", async () => {
    await assert.rejects(
      getSoroswapSwapStatus("  "),
      (err: unknown) => err instanceof AppError && err.code === "VALIDATION_ERROR",
    );
  });

  it("returns pending when Horizon has no tx yet", async () => {
    setSoroswapStatusHorizonHookForTests(async () => null);

    const result = await getSoroswapSwapStatus("abc123");
    assert.equal(result.status, "pending");
    assert.equal(result.tx_hash, "abc123");
  });

  it("returns success with ledger when Horizon reports successful tx", async () => {
    setSoroswapStatusHorizonHookForTests(async () => ({
      successful: true,
      ledger: 54321,
    }));

    const result = await getSoroswapSwapStatus("deadbeef");
    assert.equal(result.status, "success");
    assert.equal(result.ledger, 54321);
    assert.equal(result.successful, true);
  });

  it("returns failed when Horizon reports unsuccessful tx", async () => {
    setSoroswapStatusHorizonHookForTests(async () => ({
      successful: false,
      ledger: 54322,
    }));

    const result = await getSoroswapSwapStatus("cafebabe");
    assert.equal(result.status, "failed");
    assert.equal(result.successful, false);
  });
});
