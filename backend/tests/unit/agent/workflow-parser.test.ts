import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  classifyWorkflowSegment,
  isSequentialWorkflowMessage,
  parseWorkflowPlan,
  splitWorkflowSegments,
} from "../../../src/services/agent/workflow/workflow-parser.js";

describe("workflow-parser", () => {
  it("detects sequential deposit then order message", () => {
    const message =
      "Deposit 1 SUI into my DeepBook balance manager, and when you're done, " +
      "place a limit order to buy 0.1 SUI at 2 USDC on SUI_USDC";
    assert.equal(isSequentialWorkflowMessage(message), true);
    const plan = parseWorkflowPlan(message);
    assert.ok(plan);
    assert.equal(plan!.steps.length, 2);
    assert.equal(plan!.steps[0].kind, "execute");
    if (plan!.steps[0].kind === "execute") {
      assert.equal(plan!.steps[0].input.action, "deepbook_deposit");
    }
    assert.equal(plan!.steps[1].kind, "execute");
    if (plan!.steps[1].kind === "execute") {
      assert.equal(plan!.steps[1].input.action, "deepbook_place_limit_order");
    }
  });

  it("detects swap then transfer sequence", () => {
    const message =
      "Swap 1 SUI to USDC on SUI_USDC, then send 0.5 SUI to 0x" +
      "b" +
      "0".repeat(63);
    const plan = parseWorkflowPlan(message);
    assert.ok(plan);
    assert.equal(plan!.steps.length, 2);
    assert.equal(plan!.steps[0].kind, "execute");
    assert.equal(plan!.steps[1].kind, "execute");
    if (plan!.steps[1].kind === "execute") {
      assert.equal(plan!.steps[1].input.action, "transfer_sui");
    }
  });

  it("splits segments on then and when you are done", () => {
    const parts = splitWorkflowSegments("Deposit 1 SUI, then swap 2 SUI to USDC");
    assert.equal(parts.length, 2);
    assert.match(parts[0], /deposit/i);
    assert.match(parts[1], /swap/i);
  });

  it("classifies pool price query before swap", () => {
    const segment = "What's the SUI/USDC price on DeepBook";
    const step = classifyWorkflowSegment(segment);
    assert.equal(step.kind, "query");
    if (step.kind === "query") {
      assert.equal(step.input.query, "deepbook_pool_info");
    }
  });

  it("returns null for single-step messages", () => {
    assert.equal(parseWorkflowPlan("Swap 1 SUI to USDC"), null);
  });

  it("parses buy at USDC without numeric price as limit order missing price", () => {
    const segment = "order to buy 1.1 SUI at USDC on sui/usdc";
    const step = classifyWorkflowSegment(segment);
    assert.equal(step.kind, "execute");
    if (step.kind === "execute") {
      assert.equal(step.input.action, "deepbook_place_limit_order");
      assert.equal(step.input.params.quantity, 1.1);
      assert.equal(step.input.params.price, undefined);
      assert.equal(step.input.params.pool_key, "SUI_USDC");
    }
  });

  it("parses swap amount at quote coin phrasing", () => {
    const step = classifyWorkflowSegment("swap 1.6 SUI at USDC");
    assert.equal(step.kind, "execute");
    if (step.kind === "execute") {
      assert.equal(step.input.action, "swap");
      assert.equal(step.input.params.amount, 1.6);
    }
  });

  it("parses swap with optional token suffix and resolves DEEP to SUI pool", () => {
    const step = classifyWorkflowSegment("swap 10 deep token to sui");
    assert.equal(step.kind, "execute");
    if (step.kind === "execute") {
      assert.equal(step.input.action, "swap");
      assert.equal(step.input.params.amount, 10);
      assert.equal(step.input.params.input_coin, "DEEP");
      assert.equal(step.input.params.output_coin, "SUI");
      assert.equal(step.input.params.side, "sell");
      assert.equal(step.input.params.pool_key, "DEEP_SUI");
    }
  });

  it("parses click the order to buy with explicit price", () => {
    const segment =
      "click the order to buy 0.1 SUI at 2 USDC on sui/usdc";
    const step = classifyWorkflowSegment(segment);
    assert.equal(step.kind, "execute");
    if (step.kind === "execute") {
      assert.equal(step.input.action, "deepbook_place_limit_order");
      assert.equal(step.input.params.quantity, 0.1);
      assert.equal(step.input.params.price, 2);
    }
  });
});
