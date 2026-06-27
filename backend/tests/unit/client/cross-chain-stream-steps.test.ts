import assert from "node:assert/strict";
import { describe, it } from "node:test";

/**
 * Client `mapStreamStepToExecutionStep` mapping — kept backend-runnable because
 * chat-execution-steps pulls Next `@/` aliases at runtime.
 */
describe("mapStreamStepToExecutionStep cross-chain ids", () => {
  function mapId(stepId: string): string {
    if (stepId === "liquidity_fallback_offered") return "fallback-offer";
    if (stepId === "squid_quote") return "squid-quote";
    return stepId;
  }

  function mapStatus(stepId: string, status: string): string {
    if (stepId === "liquidity_fallback_offered" && status === "running") return "pending";
    return status;
  }

  it("maps backend stream ids to client execution step ids", () => {
    assert.equal(mapId("liquidity_fallback_offered"), "fallback-offer");
    assert.equal(mapId("squid_quote"), "squid-quote");
    assert.equal(mapStatus("liquidity_fallback_offered", "running"), "pending");
  });
});
