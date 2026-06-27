import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import { resetChainConfigCacheForTests } from "../../../src/config/chains.js";
import { resetSupportedTokensCacheForTests } from "../../../src/config/supported-tokens.js";
import { clearDefiCacheForTests } from "../../../src/services/defi/cache.js";
import { setRedisClientForTests } from "../../../src/infrastructure/redis/client.js";
import { buildDeFiApprovalPreview } from "../../../src/services/agent-transaction/approval-preview/build-preview.js";
import { buildTransactionDisplay } from "../../../src/services/agent-transaction/deepbook/build-display.js";
import { enrichExecuteInputForApproval } from "../../../src/services/agent-transaction/approval-preview/enrichers/registry.js";
import {
  applySoroswapQuoteToExecuteParams,
  isSoroswapApprovalDisplayComplete,
} from "../../../src/services/agent-transaction/approval-preview/enrichers/soroswap-route-params.js";
import { enrichSoroswapExecuteInputForApproval } from "../../../src/services/agent-transaction/approval-preview/enrichers/soroswap.js";
import {
  executeStellarSoroswapAction,
  isSoroswapExecuteAction,
} from "../../../src/services/agent/chains/stellar/soroswap/execute-actions.js";
import { buildStellarRoutingFallbackPendingFromOffer } from "../../../src/services/agent/transaction-approval.service.js";
import { storeSoroswapQuote } from "../../../src/services/defi/soroswap/soroswap-cache.js";
import { setSoroswapExecuteHooksForTests } from "../../../src/services/defi/soroswap/soroswap-execute.service.js";
import {
  resetSoroswapClientForTests,
  setSoroswapFetchImplForTests,
} from "../../../src/services/defi/soroswap/soroswap.client.js";
import { setResolveSoroswapWalletAddressForTests } from "../../../src/services/defi/soroswap/soroswap-wallet-addresses.js";
import { setGetSoroswapTokensForTests } from "../../../src/services/defi/soroswap/soroswap-token-catalog.service.js";
import type { SoroswapStoredQuotePayload, SoroswapToken } from "../../../src/services/defi/soroswap/soroswap.types.js";
import { normalizeSoroswapQuote } from "../../../src/services/defi/soroswap/soroswap-normalize.js";
import { AppError } from "../../../src/errors/app-error.js";

const STELLAR = "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF";
const QUOTE_ID = "soroswap:approval-test";
const PRIVY_USER = "did:privy:soroswap-approval";

const catalogTokens: SoroswapToken[] = [
  { address: "native", symbol: "XLM", decimals: 7, name: "Stellar Lumens", type: "native" },
  {
    address: "USDC:GA5ZSEJY2YZN5OMRE3KK6QANRT6WK463FHAI3BYT5PBSHH5BYKHARY",
    symbol: "USDC",
    decimals: 7,
    name: "USD Coin",
    type: "classic",
    issuer: "GA5ZSEJY2YZN5OMRE3KK6QANRT6WK463FHAI3BYT5PBSHH5BYKHARY",
  },
];

function enableStellarEnv(): void {
  process.env.ENABLED_CHAINS = "stellar,ethereum";
  process.env.ENABLED_EVM_CHAIN_IDS = "8453";
  process.env.EVM_CHAIN_IDS = "8453";
  process.env.EVM_RPC_URL_8453 = "http://localhost:8547";
  resetChainConfigCacheForTests();
  resetSupportedTokensCacheForTests();
  setGetSoroswapTokensForTests(async () => catalogTokens);
}

function enableSoroswapEnv(): void {
  process.env.SOROSWAP_ENABLED = "true";
  process.env.SOROSWAP_API_KEY = "sk_test_key";
}

function storedQuotePayload(): SoroswapStoredQuotePayload {
  return {
    quote_id: QUOTE_ID,
    quote: {
      amountIn: "100000000",
      amountOut: "25000000",
      tradeType: "EXACT_IN",
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    },
    stored_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + 60_000).toISOString(),
    raw_request: {
      assetIn: "native",
      assetOut: "USDC:GA5ZSEJY2YZN5OMRE3KK6QANRT6WK463FHAI3BYT5PBSHH5BYKHARY",
      amount: "100000000",
      tradeType: "EXACT_IN",
    },
  };
}

describe("approval preview — Soroswap", () => {
  beforeEach(() => {
    enableStellarEnv();
    enableSoroswapEnv();
    setResolveSoroswapWalletAddressForTests(async () => STELLAR);
    setRedisClientForTests(null);
    clearDefiCacheForTests();
  });

  afterEach(() => {
    resetSoroswapClientForTests();
    setResolveSoroswapWalletAddressForTests(null);
    setGetSoroswapTokensForTests(null);
    setSoroswapExecuteHooksForTests(null);
    void import("../../../src/services/defi/soroswap/soroswap-build.service.js").then((mod) => {
      mod.setSoroswapBuildStellarHooksForTests(null);
    });
    clearDefiCacheForTests();
    setRedisClientForTests(null);
    delete process.env.SOROSWAP_ENABLED;
    delete process.env.SOROSWAP_API_KEY;
  });

  it("applySoroswapQuoteToExecuteParams maps quote display fields", () => {
    const quote = normalizeSoroswapQuote({
      token_in: "XLM",
      token_out: "USDC",
      quote_id: QUOTE_ID,
      quote: storedQuotePayload().quote,
    });

    const params = applySoroswapQuoteToExecuteParams(
      { route_id: QUOTE_ID, slippage: 0.01 },
      quote,
    );

    assert.equal(params.provider_id, "stellar-soroswap");
    assert.equal(params.token_in, "XLM");
    assert.equal(params.token_out, "USDC");
    assert.equal(params.from_amount_display, "10");
    assert.equal(params.to_amount_display, "2.5");
    assert.equal(typeof params.min_out_display, "number");
    assert.equal(typeof params.expires_at, "string");
    assert.ok(isSoroswapApprovalDisplayComplete(params));
  });

  it("enriches Soroswap execute params from stored quote", async () => {
    await storeSoroswapQuote(QUOTE_ID, storedQuotePayload());

    const enriched = await enrichSoroswapExecuteInputForApproval(PRIVY_USER, {
      chain_id: "stellar",
      action: "stellar_swap",
      params: {
        quote_id: QUOTE_ID,
        token_in: "XLM",
        token_out: "USDC",
        amount: "100000000",
      },
    });

    assert.equal(enriched.kind, "enriched");
    if (enriched.kind !== "enriched") {
      return;
    }
    assert.equal(enriched.input.params.provider_id, "stellar-soroswap");
    assert.equal(enriched.input.params.from_amount_display, "10");
    assert.equal(enriched.input.params.to_amount_display, "2.5");
  });

  it("builds swap approval preview with pay/receive and countdown", async () => {
    await storeSoroswapQuote(QUOTE_ID, storedQuotePayload());
    const enriched = await enrichExecuteInputForApproval(PRIVY_USER, {
      chain_id: "stellar",
      action: "stellar_swap",
      params: { quote_id: QUOTE_ID, token_in: "XLM", token_out: "USDC", amount: "100000000" },
    });
    assert.equal(enriched.kind, "enriched");
    if (enriched.kind !== "enriched") {
      return;
    }

    const display = await buildTransactionDisplay(PRIVY_USER, enriched.input);
    const preview = buildDeFiApprovalPreview(display, enriched.input, null);

    assert.ok(preview);
    assert.equal(preview!.kind, "swap");
    assert.equal(preview!.provider_id, "stellar-soroswap");
    assert.equal(preview!.pay?.symbol, "XLM");
    assert.equal(preview!.receive?.symbol, "USDC");
    assert.ok(preview!.quote_expires_at);
  });

  it("offers stellar routing fallback on wrong chain", async () => {
    const result = await enrichExecuteInputForApproval(PRIVY_USER, {
      chain_id: "ethereum",
      action: "stellar_swap",
      params: {
        token_in: "XLM",
        token_out: "USDC",
        amount: "100000000",
        evm_chain_id: 8453,
      },
    });

    assert.equal(result.kind, "stellar_routing_fallback_offered");
    if (result.kind !== "stellar_routing_fallback_offered") {
      return;
    }
    assert.equal(result.stellar_routing_fallback_offer.token_in, "XLM");
    assert.equal(result.stellar_routing_fallback_offer.selected_chain_id, "ethereum");

    const pending = buildStellarRoutingFallbackPendingFromOffer(
      {
        chain_id: "ethereum",
        action: "stellar_swap",
        params: { token_in: "XLM", token_out: "USDC", amount: "100000000" },
      },
      result.stellar_routing_fallback_offer,
    );
    assert.equal(pending.approval_outcome, "stellar_routing_fallback_offered");
    assert.ok(pending.stellar_routing_fallback_offer);
  });

  it("executeStellarSoroswapAction dispatches quote_id path", async () => {
    await storeSoroswapQuote(QUOTE_ID, storedQuotePayload());

    setSoroswapFetchImplForTests(async (url, init) => {
      const path = String(url);
      if (path.includes("/health")) {
        return new Response(JSON.stringify({ status: "ok", protocols: ["soroswap"] }), {
          status: 200,
        });
      }
      if (path.includes("/quote/build") && init?.method === "POST") {
        return new Response(JSON.stringify({ xdr: "AAAA..." }), { status: 200 });
      }
      return new Response(JSON.stringify({ message: "unexpected" }), { status: 500 });
    });

    setSoroswapExecuteHooksForTests({
      resolveSigningWallet: async () => ({
        privy_wallet_id: "wallet-1",
        address: STELLAR,
        signer_added: true,
      }),
      parseXdr: () => ({}) as never,
      executeSigned: async () => ({
        hash: "abc123",
        stellar_address: STELLAR,
        effects_status: "success",
      }),
      fetchSwapStatus: async () => ({ tx_hash: "abc123", status: "success" as const }),
    });

    const { setSoroswapBuildStellarHooksForTests } = await import(
      "../../../src/services/defi/soroswap/soroswap-build.service.js"
    );
    setSoroswapBuildStellarHooksForTests({
      parseXdr: () => ({}) as never,
      simulate: async () => undefined,
    });

    assert.ok(isSoroswapExecuteAction("stellar_swap"));

    const result = await executeStellarSoroswapAction(PRIVY_USER, "stellar_swap", {
      quote_id: QUOTE_ID,
      token_in: "XLM",
      token_out: "USDC",
      amount: "100000000",
    });

    assert.equal(result.hash, "abc123");
    assert.equal(result.stellar_address, STELLAR);
  });

  it("requires quote reference when no xdr on stellar chain", async () => {
    await assert.rejects(
      enrichSoroswapExecuteInputForApproval(PRIVY_USER, {
        chain_id: "stellar",
        action: "stellar_swap",
        params: {},
      }),
      (err: unknown) => err instanceof AppError && err.code === "SOROSWAP_NO_QUOTE",
    );
  });
});
