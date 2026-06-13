import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { categorizeAgentTransactionAction } from "../../../src/services/agent-transaction/categorize-action.js";

describe("categorizeAgentTransactionAction", () => {
  it("maps swap actions", () => {
    assert.equal(categorizeAgentTransactionAction("swap"), "swap");
    assert.equal(categorizeAgentTransactionAction("deepbook_swap"), "swap");
  });

  it("maps transfer actions", () => {
    assert.equal(categorizeAgentTransactionAction("transfer_native"), "transfer");
    assert.equal(categorizeAgentTransactionAction("transfer_sui"), "transfer");
  });

  it("maps deepbook balance actions", () => {
    assert.equal(categorizeAgentTransactionAction("deepbook_deposit"), "deepbook_balance");
    assert.equal(categorizeAgentTransactionAction("deepbook_withdraw"), "deepbook_balance");
    assert.equal(categorizeAgentTransactionAction("deepbook_provision_manager"), "deepbook_balance");
  });

  it("maps order lifecycle actions", () => {
    assert.equal(categorizeAgentTransactionAction("deepbook_place_limit_order"), "deepbook_order");
    assert.equal(categorizeAgentTransactionAction("deepbook_place_market_order"), "deepbook_order");
    assert.equal(categorizeAgentTransactionAction("deepbook_cancel_order"), "deepbook_cancel");
    assert.equal(categorizeAgentTransactionAction("deepbook_cancel_orders"), "deepbook_cancel");
    assert.equal(categorizeAgentTransactionAction("deepbook_cancel_all_orders"), "deepbook_cancel");
    assert.equal(categorizeAgentTransactionAction("deepbook_modify_order"), "deepbook_modify");
    assert.equal(
      categorizeAgentTransactionAction("deepbook_withdraw_settled_amounts"),
      "deepbook_settled",
    );
  });

  it("maps flash loan actions", () => {
    assert.equal(categorizeAgentTransactionAction("deepbook_flash_loan"), "flash_loan");
  });

  it("falls back to other", () => {
    assert.equal(categorizeAgentTransactionAction("execute_bytes"), "other");
  });
});
