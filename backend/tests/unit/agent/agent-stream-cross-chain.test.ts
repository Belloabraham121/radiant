import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { setRedisClientForTests } from "../../../src/infrastructure/redis/client.js";
import {
  buildLiquidityFallbackOfferedStep,
  buildSquidQuoteStep,
  emitLiquidityFallbackOfferedStep,
  emitSquidQuoteStep,
  LIQUIDITY_FALLBACK_OFFERED_LABEL,
  SQUID_QUOTE_RUNNING_LABEL,
} from "../../../src/services/agent/agent-stream-cross-chain.js";
import {
  resetAgentStreamForTests,
  subscribeAgentStream,
} from "../../../src/services/agent/agent-stream.service.js";

const sessionId = "00000000-0000-4000-8000-00000000b007";

describe("agent-stream cross-chain steps", () => {
  before(async () => {
    setRedisClientForTests(null);
    await resetAgentStreamForTests();
  });

  after(async () => {
    await resetAgentStreamForTests();
    setRedisClientForTests(undefined);
  });

  it("buildLiquidityFallbackOfferedStep uses liquidity_fallback_offered id and defi category", () => {
    const step = buildLiquidityFallbackOfferedStep({
      fallback_offer_id: "offer-1",
      from_token: "USDC",
      to_token: "ETH",
      from_chain_id: "ethereum",
      to_chain_id: "ethereum",
    });

    assert.equal(step.id, "liquidity_fallback_offered");
    assert.equal(step.label, LIQUIDITY_FALLBACK_OFFERED_LABEL);
    assert.equal(step.status, "running");
    assert.equal(step.status_category, "defi");
    assert.match(step.detail ?? "", /USDC → ETH/);
  });

  it("buildSquidQuoteStep maps running status to getting alternate route label", () => {
    const step = buildSquidQuoteStep({
      status: "running",
      from_token: "USDC",
      to_token: "ETH",
    });

    assert.equal(step.id, "squid_quote");
    assert.equal(step.label, SQUID_QUOTE_RUNNING_LABEL);
    assert.equal(step.status, "running");
    assert.equal(step.status_category, "defi");
  });

  it("emitLiquidityFallbackOfferedStep delivers execution_step SSE event", () => {
    const events: Array<{ type: string; execution_step?: { id?: string } }> = [];
    const unsubscribe = subscribeAgentStream(sessionId, (event) => {
      events.push(event as typeof events[number]);
    });

    emitLiquidityFallbackOfferedStep(sessionId, {
      fallback_offer_id: "offer-2",
      from_token: "SUI",
      to_token: "USDC",
    });

    unsubscribe();

    assert.equal(events.length, 1);
    assert.equal(events[0]?.type, "execution_step");
    assert.equal(events[0]?.execution_step?.id, "liquidity_fallback_offered");
  });

  it("emitSquidQuoteStep no-ops without sessionId", () => {
    const events: unknown[] = [];
    const unsubscribe = subscribeAgentStream(sessionId, (event) => {
      events.push(event);
    });

    emitSquidQuoteStep(undefined, { status: "running" });

    unsubscribe();
    assert.equal(events.length, 0);
  });

  it("emitSquidQuoteStep delivers squid_quote execution_step", () => {
    const events: Array<{ execution_step?: { id?: string; status?: string } }> = [];
    const unsubscribe = subscribeAgentStream(sessionId, (event) => {
      events.push(event as (typeof events)[number]);
    });

    emitSquidQuoteStep(sessionId, { status: "ok", from_token: "USDC", to_token: "ETH" });

    unsubscribe();

    assert.equal(events.length, 1);
    assert.equal(events[0]?.execution_step?.id, "squid_quote");
    assert.equal(events[0]?.execution_step?.status, "ok");
  });
});
