import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  acceptStellarRoutingFallback,
  isStellarRoutingFallbackPending,
  markStellarRoutingOfferDeclinedInMessages,
  rejectStellarRoutingFallback,
} from "../../src/lib/stellar-routing-fallback";
import type { PendingTransaction } from "../../src/lib/chat-api";

describe("stellar-routing-fallback helpers", () => {
  it("uses exported accept/reject API wrappers", () => {
    assert.equal(typeof acceptStellarRoutingFallback, "function");
    assert.equal(typeof rejectStellarRoutingFallback, "function");
    assert.match(acceptStellarRoutingFallback.toString(), /stellar-routing-fallback/);
    assert.match(rejectStellarRoutingFallback.toString(), /stellar-routing-fallback/);
  });
});

describe("isStellarRoutingFallbackPending", () => {
  it("returns true only for stellar_routing_fallback_offered with offer id", () => {
    const pending: PendingTransaction = {
      id: "tx-1",
      chain_id: "ethereum",
      action: "stellar_swap",
      params: {},
      summary: "Swap on Stellar?",
      amount_display: "XLM → USDC",
      approval_outcome: "stellar_routing_fallback_offered",
      stellar_routing_fallback_offer: {
        fallback_offer_id: "offer-1",
        status: "offered",
        selected_chain_id: "ethereum",
        token_in: "XLM",
        token_out: "USDC",
        amount: "50000000",
        offered_at: "2026-01-01T00:00:00.000Z",
        expires_at: "2026-01-01T00:10:00.000Z",
      },
    };

    assert.equal(isStellarRoutingFallbackPending(pending), true);
    assert.equal(isStellarRoutingFallbackPending({ ...pending, approval_outcome: undefined }), false);
    assert.equal(
      isStellarRoutingFallbackPending({
        ...pending,
        approval_outcome: "liquidity_fallback_offered",
      }),
      false,
    );
  });
});

describe("markStellarRoutingOfferDeclinedInMessages", () => {
  it("marks stellar-routing-offer step as skipped", () => {
    const messages = [
      {
        id: "m1",
        executionSteps: [
          {
            id: "stellar-routing-offer",
            status: "pending" as const,
            label: "Checking Stellar option…",
          },
        ],
      },
    ];

    const next = markStellarRoutingOfferDeclinedInMessages(messages);
    const step = next[0]?.executionSteps?.[0];
    assert.equal(step?.id, "stellar-routing-offer");
    assert.equal(step?.status, "skipped");
    assert.equal(step?.detail, "Stellar swap declined");
  });
});
