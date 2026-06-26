import { afterEach, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { resetChainConfigCacheForTests } from "../../../src/config/chains.js";
import { resetEvmConfigCacheForTests } from "../../../src/config/evm.js";
import {
  isHypotheticalBridgeMessage,
  isBridgeIntentComplete,
  messageLooksLikeBridge,
  parsePartialBridgeIntent,
  withDefaultBridgeChains,
} from "../../../src/services/agent/bridge/bridge-intent-parser.js";
import {
  applyBridgeClarificationAnswer,
  collectBridgeClarificationGap,
} from "../../../src/services/agent/bridge/bridge-clarification-gaps.js";

function enableBridgeTestChains(): void {
  process.env.ENABLED_CHAINS = "sui,ethereum";
  process.env.ENABLED_EVM_CHAIN_IDS = "1,42161,8453";
  process.env.EVM_CHAIN_IDS = "1,42161,8453";
  process.env.EVM_RPC_URL = "http://localhost:8545";
  process.env.EVM_RPC_URL_1 = "http://localhost:8545";
  process.env.EVM_RPC_URL_42161 = "http://localhost:8546";
  process.env.EVM_RPC_URL_8453 = "http://localhost:8547";
  resetChainConfigCacheForTests();
  resetEvmConfigCacheForTests();
}

function clearBridgeTestChains(): void {
  delete process.env.ENABLED_CHAINS;
  delete process.env.ENABLED_EVM_CHAIN_IDS;
  delete process.env.EVM_CHAIN_IDS;
  delete process.env.EVM_RPC_URL;
  delete process.env.EVM_RPC_URL_1;
  delete process.env.EVM_RPC_URL_42161;
  delete process.env.EVM_RPC_URL_8453;
  resetChainConfigCacheForTests();
  resetEvmConfigCacheForTests();
}

describe("bridge-intent-parser", () => {
  beforeEach(() => {
    enableBridgeTestChains();
  });

  afterEach(() => {
    clearBridgeTestChains();
  });
  it("detects bridge verbs", () => {
    assert.equal(messageLooksLikeBridge("bridge from sui to base"), true);
    assert.equal(messageLooksLikeBridge("hello there"), false);
  });

  it("detects cross-chain phrasing", () => {
    assert.equal(messageLooksLikeBridge("move 5 sui cross chain to solana"), true);
  });

  it("skips hypothetical questions", () => {
    assert.equal(isHypotheticalBridgeMessage("what if I bridge sui to base?"), true);
    assert.equal(isHypotheticalBridgeMessage("bridge 2 sui to base"), false);
  });

  it("parses bridge from sui to base", () => {
    const intent = parsePartialBridgeIntent("bridge from sui to base");
    assert.ok(intent);
    assert.equal(intent!.fromChainId, "sui");
    assert.equal(intent!.toChainId, "ethereum");
    assert.equal(intent!.toEvmChainId, 8453);
    assert.equal(intent!.fromToken, undefined);
  });

  it("parses bridge 2 sui to base", () => {
    const intent = parsePartialBridgeIntent("bridge 2 sui to base");
    assert.ok(intent);
    assert.equal(intent!.amount, 2);
    assert.equal(intent!.fromToken, "SUI");
    assert.equal(intent!.fromChainId, "sui");
    assert.equal(intent!.toChainId, "ethereum");
    assert.equal(intent!.toEvmChainId, 8453);
    assert.equal(isBridgeIntentComplete(intent!), false);
  });
});

describe("bridge-clarification-gaps", () => {
  beforeEach(() => {
    enableBridgeTestChains();
  });

  afterEach(() => {
    clearBridgeTestChains();
  });

  it("asks for from token when chains are known", () => {
    const intent = withDefaultBridgeChains(parsePartialBridgeIntent("bridge from sui to base")!);
    const gap = collectBridgeClarificationGap(intent);
    assert.ok(gap);
    assert.equal(gap!.field, "from_token");
    assert.equal(gap!.interaction_type, "single_choice");
  });

  it("asks for destination token when source token and amount are known", () => {
    const intent = withDefaultBridgeChains(parsePartialBridgeIntent("bridge 2 sui to base")!);
    const gap = collectBridgeClarificationGap(intent);
    assert.ok(gap);
    assert.equal(gap!.field, "to_token");
    assert.ok(gap!.options?.some((option) => option.id === "USDC"));
  });

  it("applies destination token answer", () => {
    const intent = withDefaultBridgeChains(parsePartialBridgeIntent("bridge 2 sui to base")!);
    const gap = collectBridgeClarificationGap(intent)!;
    const applied = applyBridgeClarificationAnswer(intent, gap, {
      selected_option_id: "USDC",
    });
    assert.ok(applied);
    assert.equal(applied!.toToken, "USDC");
    assert.equal(applied!.amount, 2);
  });

  it("asks for amount when tokens and chains are known", () => {
    const gap = collectBridgeClarificationGap({
      originalMessage: "bridge sui to base",
      fromChainId: "sui",
      toChainId: "ethereum",
      toEvmChainId: 8453,
      fromToken: "SUI",
      toToken: "USDC",
    });
    assert.ok(gap);
    assert.equal(gap!.field, "amount");
    assert.equal(gap!.interaction_type, "input");
    assert.equal(gap!.input_kind, "text");
  });

  it("applies USD amount answer", () => {
    const gap = {
      gap_id: "bridge.amount",
      interaction_type: "input" as const,
      question: "How much?",
      step_index: 0,
      field: "amount" as const,
      action: "bridge" as const,
      kind: "intent" as const,
      input_kind: "text" as const,
    };
    const applied = applyBridgeClarificationAnswer(
      {
        originalMessage: "bridge sui to base",
        fromChainId: "sui",
        toChainId: "ethereum",
        toEvmChainId: 8453,
        fromToken: "SUI",
        toToken: "USDC",
      },
      gap,
      { value: "$10" },
    );
    assert.ok(applied);
    assert.equal(applied!.amount, 10);
    assert.equal(applied!.amountUnit, "usd");
  });

  it("parses $10 in bridge message", () => {
    const intent = parsePartialBridgeIntent("bridge $10 eth from base to sui");
    assert.ok(intent);
    assert.equal(intent!.amount, 10);
    assert.equal(intent!.amountUnit, "usd");
  });

  it("parses bridge $1 USDC from Base to Sui without clarification gaps", () => {
    const intent = parsePartialBridgeIntent("bridge $1 USDC from Base to SUI");
    assert.ok(intent);
    assert.equal(intent!.fromChainId, "ethereum");
    assert.equal(intent!.fromEvmChainId, 8453);
    assert.equal(intent!.toChainId, "sui");
    assert.equal(intent!.fromToken, "USDC");
    assert.equal(intent!.toToken, "USDC");
    assert.equal(intent!.confirmSameToken, true);
    assert.equal(collectBridgeClarificationGap(intent!), null);
    assert.equal(isBridgeIntentComplete(intent!), true);
  });

  it("parses one USDC from base to sui with amount inferred", () => {
    const intent = parsePartialBridgeIntent("bridge one USDC from base to sui");
    assert.ok(intent);
    assert.equal(intent!.amount, 1);
    assert.equal(intent!.toToken, "USDC");
    assert.equal(collectBridgeClarificationGap(intent!), null);
    assert.equal(isBridgeIntentComplete(intent!), true);
  });

  it("still asks destination token for native-token bridges", () => {
    const intent = parsePartialBridgeIntent("bridge 2 sui to base");
    assert.ok(intent);
    const gap = collectBridgeClarificationGap(intent!);
    assert.ok(gap);
    assert.equal(gap!.field, "to_token");
    assert.match(gap!.question, /Base/i);
    assert.match(gap!.question, /SUI/i);
  });
});
