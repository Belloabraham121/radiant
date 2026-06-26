import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isLiquidityFallbackPending,
  isAlternateCrossChainRoute,
} from "../../src/lib/cross-chain-fallback";
import type { PendingTransaction } from "../../src/lib/chat-api";

const ACCEPT_PATH = "/api/v1/agent/transactions/liquidity-fallback";
const REJECT_SUFFIX = "/reject";
const ACCEPT_SUFFIX = "/accept";

describe("cross-chain-fallback helpers", () => {
  it("documents accept/reject API paths", () => {
    const offerId = "offer-123";
    assert.equal(
      `${ACCEPT_PATH}/${offerId}${ACCEPT_SUFFIX}`,
      "/api/v1/agent/transactions/liquidity-fallback/offer-123/accept",
    );
    assert.equal(
      `${ACCEPT_PATH}/${offerId}${REJECT_SUFFIX}`,
      "/api/v1/agent/transactions/liquidity-fallback/offer-123/reject",
    );
  });
});

describe("isLiquidityFallbackPending", () => {
  it("returns true only for liquidity_fallback_offered with offer id", () => {
    const pending: PendingTransaction = {
      id: "tx-1",
      chain_id: "ethereum",
      action: "cross_chain_swap",
      params: {},
      summary: "Alternate route available",
      amount_display: "USDC → ETH",
      approval_outcome: "liquidity_fallback_offered",
      liquidity_fallback_offer: {
        fallback_offer_id: "offer-1",
        status: "offered",
        from_chain_id: "ethereum",
        to_chain_id: "ethereum",
        from_token: "USDC",
        to_token: "ETH",
        amount_atomic: "10000000",
        offered_at: "2026-01-01T00:00:00.000Z",
        expires_at: "2026-01-01T00:05:00.000Z",
      },
    };

    assert.equal(isLiquidityFallbackPending(pending), true);
    assert.equal(isLiquidityFallbackPending({ ...pending, approval_outcome: undefined }), false);
  });
});

describe("isAlternateCrossChainRoute", () => {
  it("detects evm-squid provider and alternate_route flag", () => {
    const squid: PendingTransaction = {
      id: "tx-2",
      chain_id: "ethereum",
      action: "cross_chain_swap",
      params: { provider_id: "evm-squid" },
      summary: "Bridge",
      amount_display: "1 → 2",
      defi_preview: {
        kind: "bridge",
        provider_id: "evm-squid",
        title: "Bridge",
        amount_display: "1 → 2",
        alternate_route: true,
      },
    };

    assert.equal(isAlternateCrossChainRoute(squid), true);
  });
});
