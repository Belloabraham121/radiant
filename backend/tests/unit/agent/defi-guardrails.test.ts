import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import { resetChainConfigCacheForTests } from "../../../src/config/chains.js";
import { resetEvmConfigCacheForTests } from "../../../src/config/evm.js";
import { resetSupportedTokensCacheForTests, resolveTokenSymbol } from "../../../src/config/supported-tokens.js";
import { clearDefiCacheForTests } from "../../../src/services/defi/cache.js";
import { setRedisClientForTests } from "../../../src/infrastructure/redis/client.js";
import { setCreateStellarRoutingFallbackPendingForTests } from "../../../src/services/agent/swap/swap-stellar-execute.js";
import { continueBridgeClarification } from "../../../src/services/agent/bridge/bridge-clarification.flow.js";
import {
  collectBridgeClarificationGap,
  STELLAR_BRIDGE_UNSUPPORTED_MESSAGE,
} from "../../../src/services/agent/bridge/bridge-clarification-gaps.js";
import { startSessionClarification } from "../../../src/services/agent/workflow/clarification.store.js";
import { buildDefiGuardrailLines } from "../../../src/services/agent/prompts/core/defi-guardrails.js";
import { CORE_MODULE_IDS, buildFullModePromptLines } from "../../../src/services/agent/prompts/registry.js";
import { collectSwapClarificationGap } from "../../../src/services/agent/swap/swap-clarification-gaps.js";
import {
  executeStellarRoutingFallbackOffer,
  STELLAR_ROUTING_FALLBACK_SWAP_REPLY,
} from "../../../src/services/agent/swap/swap-stellar-execute.js";
import {
  detectStellarRoutingFallback,
} from "../../../src/services/defi/stellar-routing/stellar-routing-fallback.service.js";
import {
  getSharedChainsForSwapPair,
  isSwapPairOnlyOnStellar,
  STELLAR_SWAP_CHAIN_LABEL,
} from "../../../src/services/agent/swap/token-chain-affinity.js";
import { parsePartialSwapIntent, withDefaultChain } from "../../../src/services/agent/swap/swap-intent-parser.js";
import type { AgentPermissions } from "../../../src/services/agent/agent-permissions.types.js";

const PRIVY_USER = "did:privy:defi-guardrails-phase9";
const DEFAULT_PERMISSIONS: AgentPermissions = {
  auto_approve_enabled: false,
  auto_approve_max_sui: 0,
  allow_flash_loans: false,
  auto_approve_flash_loans: false,
  allow_governance: false,
  allow_margin: false,
  allow_predict: false,
};

function enablePhase9Env(): void {
  process.env.ENABLED_CHAINS = "stellar,sui,ethereum";
  process.env.ENABLED_EVM_CHAIN_IDS = "8453";
  process.env.EVM_CHAIN_IDS = "8453";
  process.env.EVM_RPC_URL_8453 = "http://localhost:8547";
  process.env.SOROSWAP_ENABLED = "true";
  process.env.SOROSWAP_API_KEY = "sk_test_key";
  resetChainConfigCacheForTests();
  resetEvmConfigCacheForTests();
  resetSupportedTokensCacheForTests();
}

describe("defi-guardrails (Phase 9)", () => {
  beforeEach(() => {
    setRedisClientForTests(null);
    enablePhase9Env();
  });

  afterEach(() => {
    setCreateStellarRoutingFallbackPendingForTests(null);
    clearDefiCacheForTests();
    delete process.env.ENABLED_CHAINS;
    delete process.env.ENABLED_EVM_CHAIN_IDS;
    delete process.env.EVM_CHAIN_IDS;
    delete process.env.EVM_RPC_URL_8453;
    delete process.env.SOROSWAP_ENABLED;
    delete process.env.SOROSWAP_API_KEY;
    resetChainConfigCacheForTests();
    resetEvmConfigCacheForTests();
    resetSupportedTokensCacheForTests();
  });

  it("core:defi-guardrails is always-on and warns against Soroswap on EVM", () => {
    assert.ok(CORE_MODULE_IDS.includes("core:defi-guardrails"));
    const lines = buildDefiGuardrailLines();
    assert.ok(lines.some((line) => /never call it when the destination or selected chain is EVM/i.test(line)));

    const prompt = buildFullModePromptLines({
      chainId: "sui",
      permissions: DEFAULT_PERMISSIONS,
    }).join("\n");
    assert.match(prompt, /Soroswap \(stellar_swap_quote \/ stellar_swap\) is Stellar same-chain only/i);
  });

  it("isSwapPairOnlyOnStellar for XLM and USDC", () => {
    assert.equal(isSwapPairOnlyOnStellar("XLM", "USDC"), true);
    const shared = getSharedChainsForSwapPair("XLM", "USDC");
    assert.equal(shared.length, 1);
    assert.equal(shared[0]?.chainId, "stellar");
  });

  it("collectSwapClarificationGap suggests Stellar (Soroswap) for XLM/USDC without chain", () => {
    const gap = collectSwapClarificationGap({
      originalMessage: "swap 10 XLM to USDC",
      inputCoin: "XLM",
      outputCoin: "USDC",
      amount: 10,
      amountSide: "pay",
    });
    assert.ok(gap);
    assert.equal(gap!.field, "chain_id");
    assert.match(gap!.question, /Stellar \(Soroswap\)/i);
    assert.equal(gap!.options?.[0]?.label, STELLAR_SWAP_CHAIN_LABEL);
  });

  it("swap XLM to USDC on Base triggers stellar routing fallback offer", async () => {
    setCreateStellarRoutingFallbackPendingForTests(async (_userId, offer) => ({
      id: "pending-phase9-fallback",
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

    const intent = withDefaultChain(parsePartialSwapIntent("swap 10 XLM to USDC on base")!);
    assert.equal(intent.chainId, "ethereum");
    assert.equal(intent.evmChainId, 8453);
    assert.equal(detectStellarRoutingFallback(intent), true);

    const outcome = await executeStellarRoutingFallbackOffer(PRIVY_USER, intent, "session-9");
    assert.ok(outcome);
    assert.equal(outcome!.reply, STELLAR_ROUTING_FALLBACK_SWAP_REPLY);
    assert.equal(
      outcome!.pending_transaction?.approval_outcome,
      "stellar_routing_fallback_offered",
    );
  });

  it("collectBridgeClarificationGap blocks bridge from Stellar-only token to Base", () => {
    const gap = collectBridgeClarificationGap({
      originalMessage: "bridge 5 XLM to base",
      fromToken: "XLM",
      toChainId: "ethereum",
      toEvmChainId: 8453,
    });
    assert.ok(gap);
    assert.equal(gap!.field, "stellar_unsupported");
    assert.equal(gap!.question, STELLAR_BRIDGE_UNSUPPORTED_MESSAGE);
  });

  it("resolveTokenSymbol returns Stellar USDC classic + Soroban metadata", () => {
    const result = resolveTokenSymbol("stellar", "USDC");
    assert.equal(result.match, "exact");
    if (result.match === "exact") {
      assert.equal(result.token.kind, "stellar_classic");
      assert.equal(result.token.stellar_asset_code, "USDC");
      assert.ok(result.token.stellar_issuer?.startsWith("G"));
      assert.ok(result.token.address?.startsWith("C"));
    }
  });
});

describe("bridge stellar unsupported clarification continuation", () => {
  beforeEach(() => {
    enablePhase9Env();
  });

  afterEach(() => {
    delete process.env.ENABLED_CHAINS;
    delete process.env.ENABLED_EVM_CHAIN_IDS;
    delete process.env.EVM_CHAIN_IDS;
    delete process.env.EVM_RPC_URL_8453;
    delete process.env.SOROSWAP_ENABLED;
    delete process.env.SOROSWAP_API_KEY;
    resetChainConfigCacheForTests();
    resetEvmConfigCacheForTests();
    resetSupportedTokensCacheForTests();
  });

  it("dismisses bridge flow after stellar unsupported acknowledgment", async () => {
    const intent = {
      originalMessage: "bridge 5 XLM to base",
      fromToken: "XLM",
      amount: 5,
      toChainId: "ethereum" as const,
      toEvmChainId: 8453,
    };
    const gap = collectBridgeClarificationGap(intent);
    assert.ok(gap);
    assert.equal(gap!.field, "stellar_unsupported");

    const state = startSessionClarification({
      sessionId: "bridge-session",
      gap,
      plan: { originalMessage: intent.originalMessage, steps: [] },
      context: "bridge_intent",
      bridgeIntent: intent,
    });

    const finished = await continueBridgeClarification(
      PRIVY_USER,
      "bridge-session",
      state.id,
      { confirm: "no" },
    );
    assert.ok(finished);
    assert.equal(finished!.workflowCompleted, true);
    assert.equal(finished!.reply, STELLAR_BRIDGE_UNSUPPORTED_MESSAGE);
  });
});
