import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import { resetChainConfigCacheForTests } from "../../../../src/config/chains.js";
import { resetEvmConfigCacheForTests } from "../../../../src/config/evm.js";
import type { LifiTrackingMeta } from "../../../../src/services/defi/lifi/lifi-tracking.types.js";
import {
  isLifiTrackingContinuationNeeded,
  isPendingApprovalExpired,
  resolveLifiContinuationApprovalTtlMs,
  resolvePendingApprovalCutoff,
  STANDARD_PENDING_APPROVAL_TTL_MS,
} from "../../../../src/services/defi/lifi/lifi-continuation-pending.js";
import {
  buildLifiContinuationExecuteInput,
  markLifiContinuationParams,
} from "../../../../src/services/defi/lifi/lifi-continuation.js";
import { prepareLifiContinuationExecuteInput } from "../../../../src/services/defi/lifi/lifi-continuation-pending.js";
import { LIFI_SOLANA_CHAIN_ID, LIFI_SUI_CHAIN_ID } from "../../../../src/config/lifi-chains.js";
import { lifiToRadiantChainRef } from "../../../../src/services/defi/lifi/lifi-chain-map.js";

const mockRoute = {
  id: "route-test-1",
  fromChainId: 1,
  toChainId: LIFI_SUI_CHAIN_ID,
  fromAmount: "1000000",
  toAmount: "999000",
  steps: [
    {
      id: "step-1",
      type: "lifi",
      tool: "mayan",
      action: {
        fromChainId: 1,
        toChainId: LIFI_SUI_CHAIN_ID,
        fromToken: {
          chainId: 1,
          address: "0x1",
          symbol: "USDC",
          decimals: 6,
          name: "USDC",
          priceUSD: "1",
        },
        toToken: {
          chainId: LIFI_SUI_CHAIN_ID,
          address: "0x2",
          symbol: "USDC",
          decimals: 6,
          name: "USDC",
          priceUSD: "1",
        },
        fromAmount: "1000000",
        toAmount: "999000",
        slippage: 0.005,
      },
      estimate: {
        fromAmount: "1000000",
        toAmount: "999000",
        executionDuration: 600,
      },
    },
  ],
} as const;

function baseTracking(overrides: Partial<LifiTrackingMeta> = {}): LifiTrackingMeta {
  return {
    route_id: "route-eth-sui",
    tx_hashes: ["0xabc"],
    from_chain_id: "ethereum",
    to_chain_id: "sui",
    from_evm_chain_id: 1,
    bridge_tool: "mayan",
    estimated_duration_seconds: 600,
    bridge_started_at: "2026-01-01T00:00:00.000Z",
    tracking_status: "PENDING",
    substatus: null,
    substatus_message: null,
    receiving_tx_hash: null,
    ...overrides,
  };
}

beforeEach(() => {
  process.env.ENABLED_CHAINS = "ethereum,sui,solana";
  process.env.ENABLED_EVM_CHAIN_IDS = "1,8453";
  process.env.EVM_CHAIN_IDS = "1,8453";
  process.env.EVM_RPC_URL_1 = "http://localhost:8545";
  process.env.EVM_RPC_URL_8453 = "http://localhost:8547";
  resetChainConfigCacheForTests();
  resetEvmConfigCacheForTests();
});

describe("resolveLifiContinuationApprovalTtlMs", () => {
  it("uses max(15min, eta + 30min)", () => {
    assert.equal(resolveLifiContinuationApprovalTtlMs(null), STANDARD_PENDING_APPROVAL_TTL_MS);
    assert.equal(
      resolveLifiContinuationApprovalTtlMs(600),
      Math.max(STANDARD_PENDING_APPROVAL_TTL_MS, 600_000 + 30 * 60_000),
    );
  });
});

describe("isPendingApprovalExpired lifi_continue", () => {
  it("does not expire continuation at standard 15min TTL", () => {
    const now = Date.now();
    const params = markLifiContinuationParams({
      route_id: "route-1",
      estimated_duration_seconds: 600,
    });
    const createdAt = new Date(now - STANDARD_PENDING_APPROVAL_TTL_MS - 60_000);
    assert.equal(isPendingApprovalExpired(params, createdAt, now), false);
  });

  it("expires standard pending approvals at 15min", () => {
    const now = Date.now();
    const params = { route_id: "route-1", expires_at: new Date(now + 60_000).toISOString() };
    const createdAt = new Date(now - STANDARD_PENDING_APPROVAL_TTL_MS - 1_000);
    assert.equal(isPendingApprovalExpired(params, createdAt, now), true);
  });

  it("expires continuation after extended TTL", () => {
    const now = Date.now();
    const params = markLifiContinuationParams({
      route_id: "route-1",
      estimated_duration_seconds: 600,
    });
    const ttl = resolveLifiContinuationApprovalTtlMs(600);
    const createdAt = new Date(now - ttl - 1_000);
    assert.equal(isPendingApprovalExpired(params, createdAt, now), true);
  });
});

describe("resolvePendingApprovalCutoff", () => {
  it("extends cutoff for lifi continuation params", () => {
    const now = Date.now();
    const params = markLifiContinuationParams({ estimated_duration_seconds: 1200 });
    const cutoff = resolvePendingApprovalCutoff(params, now);
    const ttl = resolveLifiContinuationApprovalTtlMs(1200);
    assert.equal(cutoff.getTime(), now - ttl);
  });
});

describe("isLifiTrackingContinuationNeeded", () => {
  it("detects pending_step on tracking meta", () => {
    const tracking = baseTracking({
      pending_step: {
        step_index: 1,
        chain_id: LIFI_SUI_CHAIN_ID,
        action: "cross",
        message: "Sign on Sui",
      },
    });
    assert.equal(isLifiTrackingContinuationNeeded(tracking), true);
  });

  it("detects destination action substatus from poll status", () => {
    const tracking = baseTracking();
    assert.equal(
      isLifiTrackingContinuationNeeded(tracking, {
        status: "PENDING",
        substatus: "WAIT_DESTINATION",
        substatus_message: "Action required",
        tx_hash: "0xabc",
        from_chain_id: "ethereum",
        to_chain_id: "sui",
        from_lifi_chain_id: 1,
        to_lifi_chain_id: LIFI_SUI_CHAIN_ID,
        receiving_tx_hash: null,
        tool: null,
        raw: {} as never,
      }),
      true,
    );
  });
});

describe("prepareLifiContinuationExecuteInput", () => {
  it("embeds lifi_route from parent params for poll-created continuation", async () => {
    const parentParams = {
      route_id: "route-test-1",
      from_chain_id: "ethereum",
      to_chain_id: "sui",
      from_evm_chain_id: 1,
      lifi_route: mockRoute,
    };

    const input = await prepareLifiContinuationExecuteInput({
      parentParams,
      tracking: baseTracking({
        to_chain_id: "sui",
        pending_step: {
          step_index: 0,
          chain_id: LIFI_SUI_CHAIN_ID,
          action: "cross",
          message: "Sign on Sui",
        },
      }),
    });

    assert.ok(input);
    assert.equal(input!.chain_id, "sui");
    assert.equal(input!.params.lifi_continuation, true);
    assert.ok(input!.params.lifi_route);
  });

  it("returns null when no pending_step is present", async () => {
    const input = await prepareLifiContinuationExecuteInput({
      parentParams: { route_id: "route-1" },
      tracking: baseTracking(),
    });
    assert.equal(input, null);
  });
});

describe("buildLifiContinuationExecuteInput chain-agnostic", () => {
  it("maps Sui destination chain ref", () => {
    const input = buildLifiContinuationExecuteInput(
      {
        chain_id: "ethereum",
        action: "cross_chain_swap",
        params: { route_id: "route-1", from_chain_id: "ethereum", to_chain_id: "sui" },
      },
      { step_index: 1, chain_id: LIFI_SUI_CHAIN_ID, action: "cross", message: "Sign" },
      "route-1",
    );
    assert.equal(input.chain_id, "sui");
    assert.equal(input.params.lifi_continuation, true);
  });

  it("maps Solana destination chain ref", () => {
    const solanaChainId = LIFI_SOLANA_CHAIN_ID;
    const dest = lifiToRadiantChainRef(solanaChainId);
    const input = buildLifiContinuationExecuteInput(
      {
        chain_id: "ethereum",
        action: "cross_chain_swap",
        params: { route_id: "route-sol", from_chain_id: "ethereum", to_chain_id: "solana" },
      },
      { step_index: 1, chain_id: solanaChainId, action: "cross", message: "Sign" },
      "route-sol",
    );
    assert.equal(input.chain_id, dest.chain_id);
    assert.equal(input.params.approval_kind, "lifi_continue");
  });

  it("maps EVM destination chain ref with evm_chain_id", () => {
    const input = buildLifiContinuationExecuteInput(
      {
        chain_id: "ethereum",
        action: "cross_chain_swap",
        params: {
          route_id: "route-base",
          from_chain_id: "ethereum",
          to_chain_id: "ethereum",
          from_evm_chain_id: 1,
          to_evm_chain_id: 8453,
        },
      },
      { step_index: 1, chain_id: 8453, action: "swap", message: "Sign" },
      "route-base",
    );
    assert.equal(input.chain_id, "ethereum");
    assert.equal(input.evm_chain_id, 8453);
  });
});
