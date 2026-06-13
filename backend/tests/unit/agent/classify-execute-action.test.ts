import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  categorizeAgentTransactionAction,
  classifyExecuteAction,
} from "../../../src/services/agent/classify-execute-action.js";

describe("classify-execute-action", () => {
  it("classifies core execute_transaction families", () => {
    assert.equal(classifyExecuteAction("transfer_native"), "transfer");
    assert.equal(classifyExecuteAction("deepbook_swap"), "swap");
    assert.equal(classifyExecuteAction("deepbook_place_limit_order"), "order");
    assert.equal(classifyExecuteAction("deepbook_cancel_order"), "cancel");
    assert.equal(classifyExecuteAction("deepbook_modify_order"), "modify");
    assert.equal(classifyExecuteAction("deepbook_deposit"), "balance");
    assert.equal(classifyExecuteAction("deepbook_provision_manager"), "provision");
    assert.equal(classifyExecuteAction("deepbook_flash_loan"), "flash_loan");
    assert.equal(classifyExecuteAction("deepbook_stake"), "stake");
    assert.equal(classifyExecuteAction("deepbook_unstake"), "stake");
    assert.equal(classifyExecuteAction("deepbook_submit_proposal"), "governance");
    assert.equal(classifyExecuteAction("deepbook_vote"), "governance");
  });

  it("maps execute classes to ledger categories", () => {
    assert.equal(categorizeAgentTransactionAction("deepbook_stake"), "stake");
    assert.equal(categorizeAgentTransactionAction("deepbook_vote"), "governance");
    assert.equal(categorizeAgentTransactionAction("deepbook_flash_loan"), "flash_loan");
    assert.equal(categorizeAgentTransactionAction("deepbook_provision_manager"), "deepbook_balance");
  });
});
