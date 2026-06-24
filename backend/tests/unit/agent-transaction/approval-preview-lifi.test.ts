import assert from "node:assert/strict";
import { describe, it, beforeEach } from "node:test";
import type { Route } from "@lifi/types";
import { resetChainConfigCacheForTests } from "../../../src/config/chains.js";
import { resetEvmConfigCacheForTests } from "../../../src/config/evm.js";
import { defaultAgentPermissions } from "../../../src/services/agent/agent-permissions.service.js";
import { buildDeFiApprovalPreview } from "../../../src/services/agent-transaction/approval-preview/build-preview.js";
import { enrichLifiExecuteInputForApproval } from "../../../src/services/agent-transaction/approval-preview/enrichers/lifi.js";
import {
  buildPendingTransactionPreview,
  transferRequiresApprovalWithPermissions,
} from "../../../src/services/agent/transaction-approval.service.js";

const mockRoute = {
  id: "route-test-1",
  fromChainId: 1,
  toChainId: 8453,
  fromAmount: "1000000",
  toAmount: "999000",
  steps: [
    {
      id: "step-1",
      type: "lifi",
      tool: "stargate",
      action: {
        fromChainId: 1,
        toChainId: 8453,
        fromToken: {
          chainId: 1,
          address: "0x1",
          symbol: "USDC",
          decimals: 6,
          name: "USDC",
          priceUSD: "1",
        },
        toToken: {
          chainId: 8453,
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
        executionDuration: 120,
        gasCosts: [{ amountUSD: "1.50" }],
        feeCosts: [{ amountUSD: "0.25" }],
      },
    },
  ],
} as unknown as Route;

function enableEthereumChains(): void {
  process.env.ENABLED_CHAINS = "ethereum,sui,solana";
  process.env.ENABLED_EVM_CHAIN_IDS = "1,42161,8453";
  process.env.EVM_CHAIN_IDS = "1,42161,8453";
  process.env.EVM_RPC_URL_1 = "http://localhost:8545";
  process.env.EVM_RPC_URL_42161 = "http://localhost:8546";
  process.env.EVM_RPC_URL_8453 = "http://localhost:8547";
  resetChainConfigCacheForTests();
  resetEvmConfigCacheForTests();
}

describe("approval preview — Li-Fi", () => {
  beforeEach(() => {
    enableEthereumChains();
  });
  it("always requires approval for cross_chain_swap even when auto-approve is enabled", () => {
    assert.equal(
      transferRequiresApprovalWithPermissions(defaultAgentPermissions(), {
        chain_id: "ethereum",
        action: "cross_chain_swap",
        params: { route_id: "route-test-1" },
      }),
      true,
    );
  });

  it("requires approval for cross_chain_swap when auto-approve is disabled", () => {
    assert.equal(
      transferRequiresApprovalWithPermissions(
        { auto_approve_enabled: false, auto_approve_max_sui: 25 },
        {
          chain_id: "sui",
          action: "cross_chain_swap",
          params: { route: mockRoute },
        },
      ),
      true,
    );
  });

  it("always requires approval for lifi_approve", () => {
    assert.equal(
      transferRequiresApprovalWithPermissions(defaultAgentPermissions(), {
        chain_id: "ethereum",
        action: "lifi_approve",
        params: { route_id: "route-test-1" },
      }),
      true,
    );
  });

  it("enriches Li-Fi execute params from embedded route", async () => {
    const enriched = await enrichLifiExecuteInputForApproval("did:privy:test", {
      chain_id: "ethereum",
      action: "cross_chain_swap",
      params: { route: mockRoute },
    });

    assert.equal(enriched.params.from_token_symbol, "USDC");
    assert.equal(enriched.params.to_token_symbol, "USDC");
    assert.equal(enriched.params.from_amount_display, "1");
    assert.equal(enriched.params.to_amount_display, "0.999");
    assert.deepEqual(enriched.params.bridges, ["stargate"]);
    assert.equal(typeof enriched.params.quote_expires_at, "string");
    assert.equal(enriched.params.quote_expires_at, enriched.params.expires_at);
  });

  it("builds bridge DeFiApprovalPreview shape", () => {
    const params = {
      from_token_symbol: "USDC",
      to_token_symbol: "USDC",
      from_amount_display: "1",
      to_amount_display: "0.999",
      from_chain_id: "ethereum",
      to_chain_id: "ethereum",
      from_evm_chain_id: 1,
      to_evm_chain_id: 8453,
      bridges: ["stargate"],
      fee_cost_usd: 1.75,
      quote_expires_at: new Date(Date.now() + 60_000).toISOString(),
      slippage: 0.005,
    };

    const preview = buildDeFiApprovalPreview(
      {
        title: "Bridge USDC Ethereum → Base via stargate",
        amount_display: "1 USDC (Ethereum) → ~0.999 USDC (Base)",
      },
      {
        chain_id: "ethereum",
        action: "cross_chain_swap",
        params,
      },
      null,
    );

    assert.ok(preview);
    assert.equal(preview!.kind, "bridge");
    assert.equal(preview!.provider_id, "evm-lifi");
    assert.equal(preview!.pay?.symbol, "USDC");
    assert.equal(preview!.receive?.amount_display, "0.999");
    assert.equal(preview!.route_summary, "via stargate");
    assert.equal(preview!.fee_cost_usd, 1.75);
  });

  it("buildPendingTransactionPreview includes defi_preview for cross_chain_swap", async () => {
    const pending = await buildPendingTransactionPreview("did:privy:test", {
      chain_id: "ethereum",
      action: "cross_chain_swap",
      params: { route: mockRoute },
    });

    assert.ok(pending.defi_preview);
    assert.equal(pending.defi_preview!.kind, "bridge");
    assert.equal(pending.defi_preview!.provider_id, "evm-lifi");
    assert.match(pending.summary, /Bridge USDC/i);
  });
});
