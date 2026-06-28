import assert from "node:assert/strict";
import { describe, it, beforeEach, afterEach } from "node:test";
import type { Route } from "@lifi/types";
import { resetChainConfigCacheForTests } from "../../../src/config/chains.js";
import { resetEvmConfigCacheForTests } from "../../../src/config/evm.js";
import { defaultAgentPermissions } from "../../../src/services/agent/agent-permissions.service.js";
import { buildDeFiApprovalPreview } from "../../../src/services/agent-transaction/approval-preview/build-preview.js";
import { enrichLifiExecuteInputForApproval } from "../../../src/services/agent-transaction/approval-preview/enrichers/lifi.js";
import { isExecutableLifiRoute } from "../../../src/services/defi/lifi/lifi-normalize.js";
import {
  buildPendingTransactionPreview,
  transferRequiresApprovalWithPermissions,
} from "../../../src/services/agent/transaction-approval.service.js";
import {
  mockUnitUsdPricesForAutoApproveTests,
  resetAutoApprovePriceMocksForTests,
} from "../../helpers/auto-approve-prices.js";

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
    process.env.COINGECKO_API_KEY = "CG-test-key";
    mockUnitUsdPricesForAutoApproveTests();
    enableEthereumChains();
  });

  afterEach(() => {
    resetAutoApprovePriceMocksForTests();
  });

  it("auto-approves small cross_chain_swap below USD threshold", async () => {
    assert.equal(
      await transferRequiresApprovalWithPermissions(defaultAgentPermissions(), {
        chain_id: "ethereum",
        action: "cross_chain_swap",
        params: {
          from_token_symbol: "USDC",
          to_token_symbol: "USDC",
          from_amount_display: "1",
          to_amount_display: "0.999",
        },
      }),
      false,
    );
  });

  it("requires approval for cross_chain_swap above USD threshold", async () => {
    assert.equal(
      await transferRequiresApprovalWithPermissions(defaultAgentPermissions(), {
        chain_id: "ethereum",
        action: "cross_chain_swap",
        params: {
          from_token_symbol: "USDC",
          to_token_symbol: "USDC",
          from_amount_display: "100",
          to_amount_display: "99",
        },
      }),
      true,
    );
  });

  it("requires approval for cross_chain_swap when price is unknown", async () => {
    assert.equal(
      await transferRequiresApprovalWithPermissions(defaultAgentPermissions(), {
        chain_id: "ethereum",
        action: "cross_chain_swap",
        params: { route_id: "route-test-1" },
      }),
      true,
    );
  });

  it("auto-approves cross_chain_swap from atomic USDC amount below threshold", async () => {
    assert.equal(
      await transferRequiresApprovalWithPermissions(defaultAgentPermissions(), {
        chain_id: "ethereum",
        evm_chain_id: 8453,
        action: "cross_chain_swap",
        params: {
          from_chain_id: "ethereum",
          from_evm_chain_id: 8453,
          to_chain_id: "ethereum",
          to_evm_chain_id: 42161,
          from_token_symbol: "USDC",
          to_token_symbol: "USDC",
          from_amount_atomic: "992208",
        },
      }),
      false,
    );
  });

  it("requires approval for cross_chain_swap when auto-approve is disabled", async () => {
    assert.equal(
      await transferRequiresApprovalWithPermissions(
        { ...defaultAgentPermissions(), auto_approve_enabled: false },
        {
          chain_id: "sui",
          action: "cross_chain_swap",
          params: {
            from_token_symbol: "USDC",
            to_token_symbol: "USDC",
            from_amount_display: "1",
            to_amount_display: "0.999",
            route: mockRoute,
          },
        },
      ),
      true,
    );
  });

  it("always requires approval for lifi_approve", async () => {
    assert.equal(
      await transferRequiresApprovalWithPermissions(defaultAgentPermissions(), {
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

  it("enriches from cross_chain_quote snapshot when route cache is missing", async () => {
    const enriched = await enrichLifiExecuteInputForApproval("did:privy:test", {
      chain_id: "sui",
      action: "cross_chain_swap",
      params: {
        route_id: "missing-route-id",
        from_token_symbol: "SUI",
        to_token_symbol: "SUI",
        from_chain_id: "sui",
        to_chain_id: "ethereum",
        to_evm_chain_id: 8453,
        from_amount_atomic: "2150000000",
        to_amount_atomic: "2140000000",
        from_token_decimals: 9,
        to_token_decimals: 9,
        bridges: ["mayan"],
        fee_cost_usd: 0.42,
        expires_at: new Date(Date.now() + 60_000).toISOString(),
      },
    });

    assert.equal(enriched.params.from_amount_display, "2.15");
    assert.equal(enriched.params.to_amount_display, "2.14");
    assert.equal(enriched.params.from_chain_id, "sui");
    assert.equal(enriched.params.to_evm_chain_id, 8453);
  });

  it("enriches from cross_chain_quote field names (from_token, to_token)", async () => {
    const enriched = await enrichLifiExecuteInputForApproval("did:privy:test", {
      chain_id: "sui",
      action: "cross_chain_swap",
      params: {
        route_id: "missing-route-id",
        from_token: "SUI",
        to_token: "USDC",
        from_chain_id: "sui",
        to_chain_id: "ethereum",
        to_evm_chain_id: 8453,
        from_amount_atomic: "2150000000",
        to_amount_atomic: "8500000",
        expires_at: new Date(Date.now() + 60_000).toISOString(),
      },
    });

    assert.equal(enriched.params.from_token_symbol, "SUI");
    assert.equal(enriched.params.to_token_symbol, "USDC");
    assert.equal(enriched.params.from_amount_display, "2.15");
    assert.equal(enriched.params.to_amount_display, "8.5");
  });

  it("enriches snapshot when to_token is Base USDC contract address", async () => {
    const enriched = await enrichLifiExecuteInputForApproval("did:privy:test", {
      chain_id: "sui",
      action: "cross_chain_swap",
      params: {
        route_id: "missing-route-id",
        from_token: "SUI",
        to_token: "0x833589fCD6eDb6E08f4c7C32D4f597b90BeA844E",
        from_chain_id: "sui",
        to_chain_id: "ethereum",
        to_evm_chain_id: 8453,
        from_amount_atomic: "2150000000",
        to_amount_atomic: "8500000",
        expires_at: new Date(Date.now() + 60_000).toISOString(),
      },
    });

    assert.equal(enriched.params.to_token_symbol, "USDC");
    assert.equal(enriched.params.to_amount_display, "8.5");
  });

  it("embedded route sets ~60s quote_expires_at for approval countdown", async () => {
    const before = Date.now();
    const enriched = await enrichLifiExecuteInputForApproval("did:privy:test", {
      chain_id: "ethereum",
      action: "cross_chain_swap",
      params: { route: mockRoute },
    });
    const expiresMs = Date.parse(String(enriched.params.quote_expires_at));
    assert.ok(expiresMs > before);
    assert.ok(expiresMs <= before + 65_000);
  });

  it("re-enriches when quote expiry is fresh but display fields are incomplete", async () => {
    const enriched = await enrichLifiExecuteInputForApproval("did:privy:test", {
      chain_id: "sui",
      action: "cross_chain_swap",
      params: {
        route: mockRoute,
        expires_at: new Date(Date.now() + 60_000).toISOString(),
        to_amount_display: "0.999",
      },
    });

    assert.equal(enriched.params.from_token_symbol, "USDC");
    assert.equal(enriched.params.from_amount_display, "1");
    assert.equal(enriched.params.to_amount_display, "0.999");
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

  it("buildPendingTransactionPreview persists lifi_route for execute after cache expiry", async () => {
    const pending = await buildPendingTransactionPreview("did:privy:test", {
      chain_id: "ethereum",
      action: "cross_chain_swap",
      params: { route: mockRoute },
    });

    assert.ok(isExecutableLifiRoute(pending.params.lifi_route));
    assert.ok(pending.params.from_amount_display);
    assert.ok(pending.params.to_amount_display);
  });

  it("still enriches lifi_route when display fields are complete but route object omitted", async () => {
    const enriched = await enrichLifiExecuteInputForApproval("did:privy:test", {
      chain_id: "ethereum",
      action: "cross_chain_swap",
      params: {
        route: mockRoute,
        expires_at: new Date(Date.now() + 60_000).toISOString(),
        from_token_symbol: "USDC",
        to_token_symbol: "USDC",
        from_amount_display: "1",
        to_amount_display: "0.999",
        from_chain_id: "ethereum",
        to_chain_id: "ethereum",
        from_evm_chain_id: 1,
        to_evm_chain_id: 8453,
      },
    });

    assert.ok(isExecutableLifiRoute(enriched.params.lifi_route));
  });
});
