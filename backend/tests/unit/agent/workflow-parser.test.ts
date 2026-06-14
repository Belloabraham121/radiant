import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { classifyWorkflowSegment } from "../../../src/services/agent/workflow/workflow-parser.js";

/** Segment classification only — multi-step message planning is LLM-driven (see workflow-planner). */
describe("workflow-parser segment classification", () => {
  it("classifies deposit segment", () => {
    const step = classifyWorkflowSegment("Deposit 1 SUI into my DeepBook balance manager");
    assert.equal(step.kind, "execute");
    if (step.kind === "execute") {
      assert.equal(step.input.action, "deepbook_deposit");
    }
  });

  it("classifies limit order segment", () => {
    const step = classifyWorkflowSegment(
      "place a limit order to buy 0.1 SUI at 2 USDC on SUI_USDC",
    );
    assert.equal(step.kind, "execute");
    if (step.kind === "execute") {
      assert.equal(step.input.action, "deepbook_place_limit_order");
    }
  });

  it("classifies transfer segment", () => {
    const step = classifyWorkflowSegment(
      "send 0.5 SUI to 0x" + "b" + "0".repeat(63),
    );
    assert.equal(step.kind, "execute");
    if (step.kind === "execute") {
      assert.equal(step.input.action, "transfer_sui");
    }
  });

  it("classifies pool price query", () => {
    const segment = "What's the SUI/USDC price on DeepBook";
    const step = classifyWorkflowSegment(segment);
    assert.equal(step.kind, "query");
    if (step.kind === "query") {
      assert.equal(step.input.query, "deepbook_pool_info");
    }
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

  it("classifies wallet balance query segment", () => {
    const step = classifyWorkflowSegment("tell me my wallet balance");
    assert.equal(step.kind, "query");
    if (step.kind === "query") {
      assert.equal(step.input.query, "token_balances");
    }
  });
});
