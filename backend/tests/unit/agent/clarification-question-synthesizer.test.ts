import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import { resetChainConfigCacheForTests } from "../../../src/config/chains.js";
import { resetEvmConfigCacheForTests } from "../../../src/config/evm.js";
import {
  parsePartialBridgeIntent,
  withDefaultBridgeChains,
} from "../../../src/services/agent/bridge/bridge-intent-parser.js";
import {
  collectBridgeClarificationGap,
  toBridgeQuestionContext,
} from "../../../src/services/agent/bridge/bridge-clarification-gaps.js";
import {
  questionReAsksKnownField,
  setClarificationSynthesisDepsForTests,
  synthesizeClarificationQuestion,
  validateSynthesizedClarificationQuestion,
} from "../../../src/services/agent/clarification/clarification-question-synthesizer.js";
import type { ClarificationQuestionContext } from "../../../src/services/agent/clarification/clarification-question-context.js";
import {
  collectSwapClarificationGap,
  toSwapQuestionContext,
} from "../../../src/services/agent/swap/swap-clarification-gaps.js";
import { withDefaultChain } from "../../../src/services/agent/swap/swap-intent-parser.js";
import { collectClarificationGaps } from "../../../src/services/agent/workflow/workflow-clarification-gaps.js";
import type { WorkflowPlan } from "../../../src/services/agent/workflow/workflow.types.js";
import {
  buildWorkflowKnownFacts,
  toWorkflowQuestionContext,
} from "../../../src/services/agent/clarification/workflow-clarification-context.js";
import { synthesizeWorkflowClarificationGap } from "../../../src/services/agent/clarification/intent-clarification-runner.js";

function enableTestChains(): void {
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

function clearTestChains(): void {
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

describe("clarification-question-synthesizer", () => {
  const savedApiKey = process.env.OPENAI_API_KEY;

  afterEach(() => {
    setClarificationSynthesisDepsForTests(null);
    if (savedApiKey === undefined) {
      delete process.env.OPENAI_API_KEY;
    } else {
      process.env.OPENAI_API_KEY = savedApiKey;
    }
  });

  it("falls back to template when OpenAI API key is missing", async () => {
    delete process.env.OPENAI_API_KEY;

    const ctx: ClarificationQuestionContext = {
      action: "bridge",
      gap_id: "bridge.from_token",
      field: "from_token",
      interaction_type: "single_choice",
      known: { from_chain: "Sui", to_chain: "Base" },
      template_question: "Which token on Sui should I bridge to Base?",
    };
    const template = { question: ctx.template_question, hint: "Pick a token." };

    const result = await synthesizeClarificationQuestion(ctx, template);
    assert.deepEqual(result, template);
  });

  it("falls back to template when synthesis returns invalid JSON", async () => {
    process.env.OPENAI_API_KEY = "test-key";
    setClarificationSynthesisDepsForTests({
      getConfig: () => ({
        apiKey: "test-key",
        enabled: true,
        model: "gpt-4o-mini",
        maxToolSteps: 6,
        fallbackStub: false,
        defaultChainId: "sui",
      }),
      createCompletion: async () => "not-json",
    });

    const template = { question: "How much SUI should I bridge?" };
    const ctx: ClarificationQuestionContext = {
      action: "bridge",
      gap_id: "bridge.amount",
      field: "amount",
      interaction_type: "input",
      known: {
        from_chain: "Sui",
        to_chain: "Base",
        from_token: "SUI",
        to_token: "USDC",
      },
      template_question: template.question,
    };

    const result = await synthesizeClarificationQuestion(ctx, template);
    assert.deepEqual(result, template);
  });

  it("uses LLM output when valid", async () => {
    process.env.OPENAI_API_KEY = "test-key";
    setClarificationSynthesisDepsForTests({
      getConfig: () => ({
        apiKey: "test-key",
        enabled: true,
        model: "gpt-4o-mini",
        maxToolSteps: 6,
        fallbackStub: false,
        defaultChainId: "sui",
      }),
      createCompletion: async () =>
        JSON.stringify({
          question: "What token should arrive on Base?",
          hint: "USDC is common on Base.",
        }),
    });

    const template = {
      question: "You're sending SUI from Sui to Base — what should you receive there?",
    };
    const ctx: ClarificationQuestionContext = {
      action: "bridge",
      gap_id: "bridge.to_token",
      field: "to_token",
      interaction_type: "single_choice",
      known: {
        from_chain: "Sui",
        to_chain: "Base",
        from_token: "SUI",
        amount: "2 SUI",
      },
      template_question: template.question,
    };

    const result = await synthesizeClarificationQuestion(ctx, template);
    assert.equal(result.question, "What token should arrive on Base?");
    assert.equal(result.hint, "USDC is common on Base.");
  });

  it("rejects questions that re-ask known fields", () => {
    const ctx: ClarificationQuestionContext = {
      action: "bridge",
      gap_id: "bridge.to_token",
      field: "to_token",
      interaction_type: "single_choice",
      known: {
        from_chain: "Sui",
        to_chain: "Base",
        from_token: "SUI",
      },
      template_question: "template",
    };

    assert.equal(
      questionReAsksKnownField("Which network are your tokens on now?", ctx),
      true,
    );
    assert.equal(
      validateSynthesizedClarificationQuestion(
        { question: "Which network are your tokens on now?" },
        ctx,
      ),
      false,
    );
    assert.equal(
      validateSynthesizedClarificationQuestion(
        { question: "What token should arrive on Base?" },
        ctx,
      ),
      true,
    );
  });
});

describe("clarification question context builders", () => {
  beforeEach(() => {
    enableTestChains();
  });

  afterEach(() => {
    clearTestChains();
  });

  it("builds bridge context from partial intent and gap", () => {
    const intent = withDefaultBridgeChains(parsePartialBridgeIntent("bridge 2 sui to base")!);
    const gap = collectBridgeClarificationGap(intent)!;

    const ctx = toBridgeQuestionContext(intent, gap);
    assert.equal(ctx.action, "bridge");
    assert.equal(ctx.field, "to_token");
    assert.equal(ctx.known.from_chain, "Sui");
    assert.equal(ctx.known.to_chain, "Base");
    assert.equal(ctx.known.from_token, "SUI");
    assert.equal(ctx.known.amount, "2 SUI");
    assert.ok(ctx.template_question.length > 0);
  });

  it("builds swap context from partial intent and gap", () => {
    const intent = withDefaultChain({
      originalMessage: "swap sui for usdc",
      inputCoin: "SUI",
    });
    const gap = collectSwapClarificationGap(intent)!;

    const ctx = toSwapQuestionContext(intent, gap);
    assert.equal(ctx.action, "swap");
    assert.equal(ctx.field, "output_coin");
    assert.equal(ctx.known.input_coin, "SUI");
    assert.match(ctx.template_question, /receive/i);
  });

  it("builds workflow context for deepbook deposit gap", () => {
    const plan: WorkflowPlan = {
      originalMessage: "deposit sui to deepbook",
      steps: [
        {
          kind: "execute",
          label: "Deposit SUI to DeepBook",
          input: {
            chain_id: "sui",
            action: "deepbook_deposit",
            params: { coin_key: "SUI" },
          },
        },
        {
          kind: "execute",
          label: "Swap on DeepBook",
          input: {
            chain_id: "sui",
            action: "swap",
            params: { input_coin: "SUI", output_coin: "USDC", pool_key: "SUI_USDC" },
          },
        },
      ],
    };
    const gaps = collectClarificationGaps(plan);
    const amountGap = gaps.find((gap) => gap.field === "amount_display");
    assert.ok(amountGap);

    const ctx = toWorkflowQuestionContext(plan, amountGap!);
    assert.equal(ctx.action, "workflow");
    assert.equal(ctx.known.workflow_action, "deepbook_deposit");
    assert.equal(ctx.known.coin_key, "SUI");
    assert.equal(ctx.known.step_label, "Deposit SUI to DeepBook");
  });

  it("synthesizeWorkflowClarificationGap falls back without API key", async () => {
    delete process.env.OPENAI_API_KEY;
    const plan: WorkflowPlan = {
      originalMessage: "place limit order",
      steps: [
        {
          kind: "execute",
          label: "Limit buy SUI",
          input: {
            chain_id: "sui",
            action: "deepbook_place_limit_order",
            params: { pool_key: "SUI_USDC", quantity: 1 },
          },
        },
        {
          kind: "execute",
          label: "noop",
          input: { chain_id: "sui", action: "swap", params: {} },
        },
      ],
    };
    const gaps = collectClarificationGaps(plan);
    const priceGap = gaps.find((gap) => gap.field === "price");
    assert.ok(priceGap);

    const enriched = await synthesizeWorkflowClarificationGap(plan, priceGap!);
    assert.equal(enriched.question, priceGap!.question);
    assert.equal(buildWorkflowKnownFacts(plan, priceGap!).price, undefined);
    assert.equal(buildWorkflowKnownFacts(plan, priceGap!).quantity, "1");
  });
});
