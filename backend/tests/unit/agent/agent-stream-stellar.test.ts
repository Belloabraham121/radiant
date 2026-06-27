import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { setRedisClientForTests } from "../../../src/infrastructure/redis/client.js";
import {
  buildSoroswapQuoteStep,
  buildStellarRoutingFallbackOfferedStep,
  emitSoroswapQuoteStep,
  emitStellarRoutingFallbackOfferedStep,
  SOROSWAP_QUOTE_RUNNING_LABEL,
  STELLAR_ROUTING_FALLBACK_OFFERED_LABEL,
  soroswapExecutionSteps,
} from "../../../src/services/agent/agent-stream-stellar.js";
import {
  resetAgentStreamForTests,
  subscribeAgentStream,
} from "../../../src/services/agent/agent-stream.service.js";

const sessionId = "00000000-0000-4000-8000-00000000c007";

describe("agent-stream stellar steps", () => {
  before(async () => {
    setRedisClientForTests(null);
    await resetAgentStreamForTests();
  });

  after(async () => {
    await resetAgentStreamForTests();
    setRedisClientForTests(undefined);
  });

  it("buildStellarRoutingFallbackOfferedStep uses stellar_routing_fallback_offered id and defi category", () => {
    const step = buildStellarRoutingFallbackOfferedStep({
      fallback_offer_id: "stellar-offer-1",
      token_in: "XLM",
      token_out: "USDC",
      selected_chain_id: "ethereum",
    });

    assert.equal(step.id, "stellar_routing_fallback_offered");
    assert.equal(step.label, STELLAR_ROUTING_FALLBACK_OFFERED_LABEL);
    assert.equal(step.status, "running");
    assert.equal(step.status_category, "defi");
    assert.match(step.detail ?? "", /XLM → USDC/);
  });

  it("buildSoroswapQuoteStep maps running status to getting Stellar quote label", () => {
    const step = buildSoroswapQuoteStep({
      status: "running",
      token_in: "XLM",
      token_out: "USDC",
    });

    assert.equal(step.id, "soroswap_quote");
    assert.equal(step.label, SOROSWAP_QUOTE_RUNNING_LABEL);
    assert.equal(step.status, "running");
    assert.equal(step.status_category, "defi");
    assert.equal(step.chain_id, "stellar");
  });

  it("soroswapExecutionSteps includes confirm step for pending tracking", () => {
    const steps = soroswapExecutionSteps({
      tracking_status: "pending",
      digest: "abc123def456",
      token_in: "XLM",
      token_out: "USDC",
    });

    assert.equal(steps.at(-1)?.id, "stellar_confirm");
    assert.equal(steps.at(-1)?.status, "running");
  });

  it("emitStellarRoutingFallbackOfferedStep delivers execution_step SSE event", () => {
    const events: Array<{ type: string; execution_step?: { id?: string } }> = [];
    const unsubscribe = subscribeAgentStream(sessionId, (event) => {
      events.push(event as typeof events[number]);
    });

    emitStellarRoutingFallbackOfferedStep(sessionId, {
      fallback_offer_id: "stellar-offer-2",
      token_in: "XLM",
      token_out: "USDC",
    });

    unsubscribe();

    assert.equal(events.length, 1);
    assert.equal(events[0]?.type, "execution_step");
    assert.equal(events[0]?.execution_step?.id, "stellar_routing_fallback_offered");
  });

  it("emitSoroswapQuoteStep no-ops without sessionId", () => {
    const events: unknown[] = [];
    const unsubscribe = subscribeAgentStream(sessionId, (event) => {
      events.push(event);
    });

    emitSoroswapQuoteStep(undefined, { status: "running" });

    unsubscribe();
    assert.equal(events.length, 0);
  });

  it("emitSoroswapQuoteStep delivers soroswap_quote execution_step", () => {
    const events: Array<{ execution_step?: { id?: string; status?: string } }> = [];
    const unsubscribe = subscribeAgentStream(sessionId, (event) => {
      events.push(event as (typeof events)[number]);
    });

    emitSoroswapQuoteStep(sessionId, { status: "ok", token_in: "XLM", token_out: "USDC" });

    unsubscribe();

    assert.equal(events.length, 1);
    assert.equal(events[0]?.execution_step?.id, "soroswap_quote");
    assert.equal(events[0]?.execution_step?.status, "ok");
  });
});
