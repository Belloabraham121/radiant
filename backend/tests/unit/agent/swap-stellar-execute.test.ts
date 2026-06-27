import assert from "node:assert/strict";
import { afterEach, before, beforeEach, describe, it } from "node:test";
import { AppError } from "../../../src/errors/app-error.js";
import { resetChainConfigCacheForTests } from "../../../src/config/chains.js";
import { resetEvmConfigCacheForTests } from "../../../src/config/evm.js";
import { resetSupportedTokensCacheForTests } from "../../../src/config/supported-tokens.js";
import { clearDefiCacheForTests } from "../../../src/services/defi/cache.js";
import { setRedisClientForTests } from "../../../src/infrastructure/redis/client.js";
import { setExecuteTransactionWithApprovalHandlerForTests } from "../../../src/services/agent/execute-transaction-with-approval.js";
import {
  parsePartialSwapIntent,
  withDefaultChain,
} from "../../../src/services/agent/swap/swap-intent-parser.js";
import { tryHandleSwapIntentFromMessage } from "../../../src/services/agent/swap/swap-clarification.flow.js";
import {
  buildStellarSwapQuoteParams,
  executeResolvedStellarSwap,
  executeStellarRoutingFallbackOffer,
  isStellarSwapEligible,
  setCreateStellarRoutingFallbackPendingForTests,
  setGetSoroswapQuoteForStellarSwapTests,
  STELLAR_ROUTING_FALLBACK_SWAP_REPLY,
} from "../../../src/services/agent/swap/swap-stellar-execute.js";
import type { SoroswapToken } from "../../../src/services/defi/soroswap/soroswap.types.js";
import { setGetSoroswapTokensForTests } from "../../../src/services/defi/soroswap/soroswap-token-catalog.service.js";

const PRIVY_USER = "did:privy:stellar-swap-fast-path";

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
  process.env.ENABLED_CHAINS = "stellar,sui,ethereum";
  process.env.ENABLED_EVM_CHAIN_IDS = "8453";
  process.env.EVM_CHAIN_IDS = "8453";
  process.env.EVM_RPC_URL_8453 = "http://localhost:8547";
  resetChainConfigCacheForTests();
  resetEvmConfigCacheForTests();
  resetSupportedTokensCacheForTests();
  setGetSoroswapTokensForTests(async () => catalogTokens);
}

function enableSoroswapEnv(): void {
  process.env.SOROSWAP_ENABLED = "true";
  process.env.SOROSWAP_API_KEY = "sk_test_key";
}

before(() => {
  setRedisClientForTests(null);
});

describe("swap-stellar-execute", () => {
  beforeEach(() => {
    enableStellarEnv();
    enableSoroswapEnv();
    clearDefiCacheForTests();
  });

  afterEach(() => {
    setGetSoroswapQuoteForStellarSwapTests(null);
    setCreateStellarRoutingFallbackPendingForTests(null);
    setExecuteTransactionWithApprovalHandlerForTests(null);
    setGetSoroswapTokensForTests(null);
    clearDefiCacheForTests();
    delete process.env.SOROSWAP_ENABLED;
    delete process.env.SOROSWAP_API_KEY;
    delete process.env.ENABLED_CHAINS;
    delete process.env.ENABLED_EVM_CHAIN_IDS;
    delete process.env.EVM_CHAIN_IDS;
    delete process.env.EVM_RPC_URL_8453;
    resetChainConfigCacheForTests();
    resetEvmConfigCacheForTests();
    resetSupportedTokensCacheForTests();
  });

  it("parses swap 50 XLM to USDC on Stellar", () => {
    const intent = withDefaultChain(parsePartialSwapIntent("swap 50 XLM to USDC on Stellar")!);
    assert.equal(intent.inputCoin, "XLM");
    assert.equal(intent.outputCoin, "USDC");
    assert.equal(intent.amount, 50);
    assert.equal(intent.chainId, "stellar");
  });

  it("isStellarSwapEligible for same-chain Stellar swap", () => {
    const intent = withDefaultChain(parsePartialSwapIntent("swap 50 XLM to USDC on Stellar")!);
    assert.equal(isStellarSwapEligible(intent), true);
    assert.equal(
      isStellarSwapEligible({
        originalMessage: "swap sui to usdc",
        chainId: "sui",
        inputCoin: "SUI",
        outputCoin: "USDC",
        amount: 1,
      }),
      false,
    );
  });

  it("buildStellarSwapQuoteParams converts 50 XLM to stroops", () => {
    const intent = withDefaultChain(parsePartialSwapIntent("swap 50 XLM to USDC on Stellar")!);
    const params = buildStellarSwapQuoteParams(intent);
    assert.ok(params);
    assert.equal(params!.token_in, "XLM");
    assert.equal(params!.token_out, "USDC");
    assert.equal(params!.amount, "500000000");
    assert.equal(params!.trade_type, "EXACT_IN");
  });

  it("executeResolvedStellarSwap quotes and returns pending approval", async () => {
    setGetSoroswapQuoteForStellarSwapTests(async () => ({
      quote_id: "soroswap:fast-path",
      quote: {
        amountIn: "500000000",
        amountOut: "125000000",
        tradeType: "EXACT_IN",
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
      },
      expires_at: new Date(Date.now() + 60_000).toISOString(),
    }));

    setExecuteTransactionWithApprovalHandlerForTests(async (_userId, input) => {
      assert.equal(input.chain_id, "stellar");
      assert.equal(input.action, "stellar_swap");
      assert.equal(input.params.quote_id, "soroswap:fast-path");
      return {
        status: "approval_required",
        pending: {
          id: "pending-stellar-swap",
          chain_id: "stellar",
          action: "stellar_swap",
          params: input.params,
          summary: "Swap XLM → USDC",
          amount_display: "50 XLM → USDC",
        },
      };
    });

    const intent = withDefaultChain(parsePartialSwapIntent("swap 50 XLM to USDC on Stellar")!);
    const outcome = await executeResolvedStellarSwap(PRIVY_USER, intent, "session-1");
    assert.ok(outcome);
    assert.match(outcome!.reply, /approval/i);
    assert.equal(outcome!.pending_transaction?.id, "pending-stellar-swap");
    assert.equal(outcome!.tool_calls.length, 2);
    assert.equal(outcome!.tool_calls[0]?.query, "stellar_swap_quote");
    assert.equal(outcome!.tool_calls[1]?.name, "execute_transaction");
  });

  it("returns user message on SOROSWAP_ROUTE_NOT_FOUND without fallback", async () => {
    setGetSoroswapQuoteForStellarSwapTests(async () => {
      throw new AppError(
        404,
        "SOROSWAP_ROUTE_NOT_FOUND",
        "No swap route on Stellar right now. Try a different amount, slippage, or token pair.",
      );
    });

    const intent = withDefaultChain(parsePartialSwapIntent("swap 50 XLM to USDC on Stellar")!);
    const outcome = await executeResolvedStellarSwap(PRIVY_USER, intent);
    assert.ok(outcome);
    assert.match(outcome!.reply, /no swap route on stellar/i);
    assert.equal(outcome!.pending_transaction, null);
    assert.equal(outcome!.tool_calls.length, 1);
    assert.equal(
      (outcome!.tool_calls[0]?.result as { error?: { code?: string } }).error?.code,
      "SOROSWAP_ROUTE_NOT_FOUND",
    );
  });

  it("executeStellarRoutingFallbackOffer for wrong-chain XLM/USDC intent", async () => {
    setCreateStellarRoutingFallbackPendingForTests(async (_userId, offer) => ({
      id: "pending-stellar-fallback",
      chain_id: "stellar",
      action: "stellar_swap",
      params: {
        token_in: offer.token_in,
        token_out: offer.token_out,
        amount: offer.amount,
        approval_outcome: "stellar_routing_fallback_offered",
        stellar_routing_fallback_offer: offer,
      },
      summary: "Swap on Stellar available for XLM → USDC",
      amount_display: "XLM → USDC",
      approval_outcome: "stellar_routing_fallback_offered",
      stellar_routing_fallback_offer: offer,
    }));

    const intent = withDefaultChain(
      parsePartialSwapIntent("swap 50 XLM to USDC on base") ?? {
        originalMessage: "swap 50 XLM to USDC on base",
        inputCoin: "XLM",
        outputCoin: "USDC",
        amount: 50,
        amountSide: "pay" as const,
        chainId: "ethereum" as const,
        evmChainId: 8453,
      },
    );
    assert.equal(intent.chainId, "ethereum");
    assert.equal(intent.evmChainId, 8453);

    const outcome = await executeStellarRoutingFallbackOffer(PRIVY_USER, intent, "session-1");
    assert.ok(outcome);
    assert.equal(outcome!.reply, STELLAR_ROUTING_FALLBACK_SWAP_REPLY);
    assert.equal(outcome!.pending_transaction?.id, "pending-stellar-fallback");
    assert.equal(
      outcome!.pending_transaction?.approval_outcome,
      "stellar_routing_fallback_offered",
    );
  });

  it("tryHandleSwapIntentFromMessage fast path: swap 50 XLM to USDC on Stellar", async () => {
    setGetSoroswapQuoteForStellarSwapTests(async () => ({
      quote_id: "soroswap:message-fast-path",
      quote: {
        amountIn: "500000000",
        amountOut: "125000000",
        tradeType: "EXACT_IN",
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
      },
      expires_at: new Date(Date.now() + 60_000).toISOString(),
    }));

    setExecuteTransactionWithApprovalHandlerForTests(async () => ({
      status: "approval_required",
      pending: {
        id: "pending-from-message",
        chain_id: "stellar",
        action: "stellar_swap",
        params: {},
        summary: "Swap XLM → USDC",
        amount_display: "50 XLM → USDC",
      },
    }));

    const outcome = await tryHandleSwapIntentFromMessage(
      PRIVY_USER,
      "swap 50 XLM to USDC on Stellar",
      "session-stellar",
    );
    assert.ok(outcome);
    assert.match(outcome!.reply, /approval/i);
    assert.equal(outcome!.pending_transaction?.id, "pending-from-message");
    assert.equal(outcome!.workflowCompleted, true);
  });
});
