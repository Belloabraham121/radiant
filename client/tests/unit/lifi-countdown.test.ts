import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  executionStepHasLifiCountdown,
  formatCountdownClock,
  formatLifiCountdownRemaining,
  formatLifiStaticEtaLabel,
  lifiBridgeStepLabel,
  lifiCountdownKind,
} from "../../src/lib/lifi-countdown";

describe("lifi-countdown", () => {
  it("formats MM:SS and H:MM:SS clocks", () => {
    assert.equal(formatCountdownClock(0), "00:00");
    assert.equal(formatCountdownClock(65), "01:05");
    assert.equal(formatCountdownClock(3661), "1:01:01");
  });

  it("formats static fallback labels", () => {
    assert.equal(formatLifiStaticEtaLabel(90, "bridge"), "Bridging (~2m)");
    assert.equal(formatLifiStaticEtaLabel(45, "swap"), "Swapping (~45s)");
  });

  it("ticks remaining time from bridge_started_at", () => {
    const label = formatLifiCountdownRemaining({
      kind: "bridge",
      startedAt: "2026-01-01T00:00:00.000Z",
      durationSeconds: 120,
      nowMs: Date.parse("2026-01-01T00:01:58.000Z"),
    });
    assert.equal(label, "Bridging · 00:02 remaining");
  });

  it("shows overdue copy when elapsed exceeds duration", () => {
    const label = formatLifiCountdownRemaining({
      kind: "swap",
      startedAt: "2026-01-01T00:00:00.000Z",
      durationSeconds: 60,
      nowMs: Date.parse("2026-01-01T00:02:00.000Z"),
    });
    assert.equal(label, "Swapping · taking longer than expected");
  });

  it("classifies same-chain routes as swap countdown", () => {
    assert.equal(
      lifiCountdownKind({
        fromChainId: "ethereum",
        toChainId: "ethereum",
        fromEvmChainId: 8453,
        toEvmChainId: 8453,
      }),
      "swap",
    );
  });

  it("detects countdown-capable execution steps", () => {
    assert.equal(
      executionStepHasLifiCountdown({
        id: "lifi-bridge",
        status: "running",
        estimatedDurationSeconds: 120,
        bridgeStartedAt: "2026-01-01T00:00:00.000Z",
      }),
      true,
    );
    assert.equal(
      executionStepHasLifiCountdown({
        id: "lifi-bridge",
        status: "running",
        estimatedDurationSeconds: 120,
      }),
      false,
    );
  });

  it("uses verb-only label when countdown anchor exists", () => {
    assert.equal(
      lifiBridgeStepLabel({
        kind: "bridge",
        phase: "running",
        estimatedDurationSeconds: 120,
        bridgeStartedAt: "2026-01-01T00:00:00.000Z",
      }),
      "Bridging",
    );
    assert.equal(
      lifiBridgeStepLabel({
        kind: "bridge",
        phase: "running",
        estimatedDurationSeconds: 120,
      }),
      "Bridging (~2m)",
    );
  });
});
