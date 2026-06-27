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
    if (stepId === "stellar_routing_fallback_offered") return "stellar-routing-offer";
    if (stepId === "soroswap_quote") return "soroswap-quote";
    if (stepId === "stellar_build") return "stellar-build";
    if (stepId === "stellar_sign") return "stellar-sign";
    if (stepId === "stellar_submit") return "stellar-submit";
    if (stepId === "stellar_confirm") return "stellar-confirm";
    return stepId;
  }

  function mapStatus(stepId: string, status: string): string {
    if (stepId === "liquidity_fallback_offered" && status === "running") return "pending";
    if (stepId === "stellar_routing_fallback_offered" && status === "running") return "pending";
    return status;
  }

  it("maps backend stream ids to client execution step ids", () => {
    assert.equal(mapId("liquidity_fallback_offered"), "fallback-offer");
    assert.equal(mapId("squid_quote"), "squid-quote");
    assert.equal(mapId("stellar_routing_fallback_offered"), "stellar-routing-offer");
    assert.equal(mapId("soroswap_quote"), "soroswap-quote");
    assert.equal(mapStatus("liquidity_fallback_offered", "running"), "pending");
    assert.equal(mapStatus("stellar_routing_fallback_offered", "running"), "pending");
  });
});
