import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  isHypotheticalSwapMessage,
  isSwapIntentComplete,
  messageLooksLikeSwap,
  parsePartialSwapIntent,
  withDefaultChain,
} from "../../../src/services/agent/swap/swap-intent-parser.js";
import {
  applySwapClarificationAnswer,
  collectSwapClarificationGap,
} from "../../../src/services/agent/swap/swap-clarification-gaps.js";
import type { ClarificationGap } from "../../../src/services/agent/workflow/clarification.types.js";

describe("swap-intent-parser", () => {
  it("detects swap verbs", () => {
    assert.equal(messageLooksLikeSwap("swap 2 sui to usdc"), true);
    assert.equal(messageLooksLikeSwap("hello there"), false);
  });

  it("skips hypothetical questions", () => {
    assert.equal(isHypotheticalSwapMessage("what if I swap sui to usdc?"), true);
    assert.equal(isHypotheticalSwapMessage("swap 2 sui to usdc"), false);
  });

  it("parses directed swap with pay amount", () => {
    const intent = parsePartialSwapIntent("swap 2 sui to usdc");
    assert.ok(intent);
    assert.equal(intent!.amount, 2);
    assert.equal(intent!.amountSide, "pay");
    assert.equal(intent!.inputCoin, "SUI");
    assert.equal(intent!.outputCoin, "USDC");
  });

  it("parses swap to usdc 2 as receive-side amount", () => {
    const intent = parsePartialSwapIntent("swap to usdc 2");
    assert.ok(intent);
    assert.equal(intent!.outputCoin, "USDC");
    assert.equal(intent!.amount, 2);
    assert.equal(intent!.amountSide, "receive");
    assert.equal(intent!.inputCoin, undefined);
  });

  it("reports incomplete intent without chain default", () => {
    const intent = parsePartialSwapIntent("swap to usdc 2");
    assert.ok(intent);
    assert.equal(isSwapIntentComplete(intent!), false);
  });
});

describe("swap-clarification-gaps", () => {
  it("asks for input coin when output and amount are known", () => {
    const intent = withDefaultChain(parsePartialSwapIntent("swap to usdc 2")!);
    const gap = collectSwapClarificationGap(intent);
    assert.ok(gap);
    assert.equal(gap!.field, "input_coin");
    assert.equal(gap!.interaction_type, "single_choice");
    assert.ok(gap!.options?.some((option) => option.id === "SUI"));
  });

  it("applies input coin answer and moves to chain or execute", () => {
    const intent = withDefaultChain(parsePartialSwapIntent("swap to usdc 2")!);
    const gap = collectSwapClarificationGap(intent)!;
    const applied = applySwapClarificationAnswer(intent, gap, {
      selected_option_id: "SUI",
    });
    assert.ok(applied);
    assert.equal(applied!.inputCoin, "SUI");
    assert.equal(applied!.outputCoin, "USDC");
    assert.equal(applied!.amount, 2);
  });

  it("asks for amount when tokens are known", () => {
    const gap = collectSwapClarificationGap({
      originalMessage: "swap sui to usdc",
      inputCoin: "SUI",
      outputCoin: "USDC",
    });
    assert.ok(gap);
    assert.equal(gap!.field, "amount");
    assert.equal(gap!.interaction_type, "input");
  });

  it("applies numeric amount answer", () => {
    const gap: ClarificationGap = {
      gap_id: "swap.amount",
      interaction_type: "input",
      question: "How much?",
      step_index: 0,
      field: "amount",
      action: "swap",
      kind: "intent",
      input_kind: "number",
    };
    const applied = applySwapClarificationAnswer(
      { originalMessage: "swap sui to usdc", inputCoin: "SUI", outputCoin: "USDC" },
      gap,
      { value: "3" },
    );
    assert.ok(applied);
    assert.equal(applied!.amount, 3);
    assert.equal(applied!.amountSide, "pay");
  });
});
