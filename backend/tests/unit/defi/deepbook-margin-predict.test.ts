import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  categorizeAgentTransactionAction,
  classifyExecuteAction,
} from "../../../src/services/agent/deepbook/classify-execute-action.js";
import { isDeepBookMarginAction } from "../../../src/services/defi/deepbook/deepbook-margin.service.js";
import { isDeepBookPredictAction } from "../../../src/services/defi/deepbook/deepbook-predict.service.js";
import { ONCHAIN_ACTION_NAMES } from "../../../src/services/projects/app-action.types.js";

describe("DeepBook Margin action classification", () => {
  it("classifies margin balance actions as 'margin'", () => {
    assert.equal(classifyExecuteAction("deepbook_margin_deposit"), "margin");
    assert.equal(classifyExecuteAction("deepbook_margin_withdraw"), "margin");
    assert.equal(classifyExecuteAction("deepbook_margin_borrow"), "margin");
    assert.equal(classifyExecuteAction("deepbook_margin_repay"), "margin");
    assert.equal(classifyExecuteAction("deepbook_margin_supply_pool"), "margin");
    assert.equal(classifyExecuteAction("deepbook_margin_withdraw_pool"), "margin");
  });

  it("classifies margin order actions as 'order'", () => {
    assert.equal(classifyExecuteAction("deepbook_margin_place_limit_order"), "order");
    assert.equal(classifyExecuteAction("deepbook_margin_place_market_order"), "order");
    assert.equal(classifyExecuteAction("deepbook_margin_place_reduce_only_limit_order"), "order");
    assert.equal(classifyExecuteAction("deepbook_margin_place_reduce_only_market_order"), "order");
    assert.equal(classifyExecuteAction("deepbook_margin_tpsl_add"), "order");
  });

  it("classifies margin cancel as 'cancel'", () => {
    assert.equal(classifyExecuteAction("deepbook_margin_cancel_order"), "cancel");
    assert.equal(classifyExecuteAction("deepbook_margin_cancel_orders"), "cancel");
    assert.equal(classifyExecuteAction("deepbook_margin_cancel_all_orders"), "cancel");
    assert.equal(classifyExecuteAction("deepbook_margin_tpsl_cancel"), "cancel");
    assert.equal(classifyExecuteAction("deepbook_margin_tpsl_cancel_all"), "cancel");
  });

  it("classifies margin settled withdraw as 'settled'", () => {
    assert.equal(classifyExecuteAction("deepbook_margin_withdraw_settled"), "settled");
    assert.equal(classifyExecuteAction("deepbook_margin_withdraw_settled_permissionless"), "settled");
  });

  it("classifies margin oracle refresh as 'margin'", () => {
    assert.equal(classifyExecuteAction("deepbook_margin_update_price"), "margin");
    assert.equal(classifyExecuteAction("deepbook_margin_claim_rebate"), "margin");
  });

  it("classifies margin stake actions as 'stake'", () => {
    assert.equal(classifyExecuteAction("deepbook_margin_stake"), "stake");
    assert.equal(classifyExecuteAction("deepbook_margin_unstake"), "stake");
  });

  it("classifies margin governance as 'governance'", () => {
    assert.equal(classifyExecuteAction("deepbook_margin_submit_proposal"), "governance");
    assert.equal(classifyExecuteAction("deepbook_margin_vote"), "governance");
  });

  it("classifies margin TPSL execute as 'margin'", () => {
    assert.equal(classifyExecuteAction("deepbook_margin_tpsl_execute"), "margin");
  });

  it("classifies margin modify as 'modify'", () => {
    assert.equal(classifyExecuteAction("deepbook_margin_modify_order"), "modify");
  });

  it("maps margin to correct ledger category", () => {
    assert.equal(categorizeAgentTransactionAction("deepbook_margin_deposit"), "margin");
    assert.equal(categorizeAgentTransactionAction("deepbook_margin_borrow"), "margin");
    assert.equal(categorizeAgentTransactionAction("deepbook_margin_place_limit_order"), "deepbook_order");
    assert.equal(categorizeAgentTransactionAction("deepbook_margin_cancel_order"), "deepbook_cancel");
    assert.equal(categorizeAgentTransactionAction("deepbook_margin_withdraw_settled"), "deepbook_settled");
    assert.equal(categorizeAgentTransactionAction("deepbook_margin_update_price"), "margin");
    assert.equal(categorizeAgentTransactionAction("deepbook_margin_stake"), "stake");
    assert.equal(categorizeAgentTransactionAction("deepbook_margin_vote"), "governance");
  });

  it("isDeepBookMarginAction recognizes all margin actions", () => {
    assert.equal(isDeepBookMarginAction("deepbook_margin_deposit"), true);
    assert.equal(isDeepBookMarginAction("deepbook_margin_withdraw"), true);
    assert.equal(isDeepBookMarginAction("deepbook_margin_borrow"), true);
    assert.equal(isDeepBookMarginAction("deepbook_margin_repay"), true);
    assert.equal(isDeepBookMarginAction("deepbook_margin_place_limit_order"), true);
    assert.equal(isDeepBookMarginAction("deepbook_margin_place_market_order"), true);
    assert.equal(isDeepBookMarginAction("deepbook_margin_cancel_order"), true);
    assert.equal(isDeepBookMarginAction("deepbook_margin_modify_order"), true);
    assert.equal(isDeepBookMarginAction("deepbook_margin_place_reduce_only_limit_order"), true);
    assert.equal(isDeepBookMarginAction("deepbook_margin_place_reduce_only_market_order"), true);
    assert.equal(isDeepBookMarginAction("deepbook_margin_cancel_orders"), true);
    assert.equal(isDeepBookMarginAction("deepbook_margin_cancel_all_orders"), true);
    assert.equal(isDeepBookMarginAction("deepbook_margin_withdraw_settled"), true);
    assert.equal(isDeepBookMarginAction("deepbook_margin_withdraw_settled_permissionless"), true);
    assert.equal(isDeepBookMarginAction("deepbook_margin_update_price"), true);
    assert.equal(isDeepBookMarginAction("deepbook_margin_stake"), true);
    assert.equal(isDeepBookMarginAction("deepbook_margin_unstake"), true);
    assert.equal(isDeepBookMarginAction("deepbook_margin_submit_proposal"), true);
    assert.equal(isDeepBookMarginAction("deepbook_margin_vote"), true);
    assert.equal(isDeepBookMarginAction("deepbook_margin_claim_rebate"), true);
    assert.equal(isDeepBookMarginAction("deepbook_margin_supply_pool"), true);
    assert.equal(isDeepBookMarginAction("deepbook_margin_withdraw_pool"), true);
    assert.equal(isDeepBookMarginAction("deepbook_margin_tpsl_add"), true);
    assert.equal(isDeepBookMarginAction("deepbook_margin_tpsl_cancel"), true);
    assert.equal(isDeepBookMarginAction("deepbook_margin_tpsl_cancel_all"), true);
    assert.equal(isDeepBookMarginAction("deepbook_margin_tpsl_execute"), true);
    assert.equal(isDeepBookMarginAction("deepbook_swap"), false);
  });
});

describe("DeepBook Predict action classification", () => {
  it("classifies predict actions as 'predict'", () => {
    assert.equal(classifyExecuteAction("deepbook_predict_deposit"), "predict");
    assert.equal(classifyExecuteAction("deepbook_predict_withdraw"), "predict");
    assert.equal(classifyExecuteAction("deepbook_predict_mint"), "predict");
    assert.equal(classifyExecuteAction("deepbook_predict_redeem"), "predict");
    assert.equal(classifyExecuteAction("deepbook_predict_mint_range"), "predict");
    assert.equal(classifyExecuteAction("deepbook_predict_redeem_range"), "predict");
    assert.equal(classifyExecuteAction("deepbook_predict_supply"), "predict");
    assert.equal(classifyExecuteAction("deepbook_predict_lp_withdraw"), "predict");
  });

  it("maps predict to correct ledger category", () => {
    assert.equal(categorizeAgentTransactionAction("deepbook_predict_mint"), "predict");
    assert.equal(categorizeAgentTransactionAction("deepbook_predict_supply"), "predict");
  });

  it("isDeepBookPredictAction recognizes all predict actions", () => {
    assert.equal(isDeepBookPredictAction("deepbook_predict_deposit"), true);
    assert.equal(isDeepBookPredictAction("deepbook_predict_withdraw"), true);
    assert.equal(isDeepBookPredictAction("deepbook_predict_mint"), true);
    assert.equal(isDeepBookPredictAction("deepbook_predict_redeem"), true);
    assert.equal(isDeepBookPredictAction("deepbook_predict_mint_range"), true);
    assert.equal(isDeepBookPredictAction("deepbook_predict_redeem_range"), true);
    assert.equal(isDeepBookPredictAction("deepbook_predict_supply"), true);
    assert.equal(isDeepBookPredictAction("deepbook_predict_lp_withdraw"), true);
    assert.equal(isDeepBookPredictAction("deepbook_swap"), false);
  });
});

describe("ONCHAIN_ACTION_NAMES includes margin and predict", () => {
  it("includes all margin actions", () => {
    const names = ONCHAIN_ACTION_NAMES as readonly string[];
    assert.ok(names.includes("margin_deposit"));
    assert.ok(names.includes("margin_withdraw"));
    assert.ok(names.includes("margin_borrow"));
    assert.ok(names.includes("margin_repay"));
    assert.ok(names.includes("margin_place_limit_order"));
    assert.ok(names.includes("margin_place_market_order"));
    assert.ok(names.includes("margin_cancel_order"));
    assert.ok(names.includes("margin_modify_order"));
    assert.ok(names.includes("margin_place_reduce_only_limit_order"));
    assert.ok(names.includes("margin_place_reduce_only_market_order"));
    assert.ok(names.includes("margin_cancel_orders"));
    assert.ok(names.includes("margin_cancel_all_orders"));
    assert.ok(names.includes("margin_withdraw_settled"));
    assert.ok(names.includes("margin_withdraw_settled_permissionless"));
    assert.ok(names.includes("margin_update_price"));
    assert.ok(names.includes("margin_stake"));
    assert.ok(names.includes("margin_unstake"));
    assert.ok(names.includes("margin_submit_proposal"));
    assert.ok(names.includes("margin_vote"));
    assert.ok(names.includes("margin_claim_rebate"));
    assert.ok(names.includes("margin_supply_pool"));
    assert.ok(names.includes("margin_withdraw_pool"));
    assert.ok(names.includes("margin_tpsl_add"));
    assert.ok(names.includes("margin_tpsl_cancel"));
    assert.ok(names.includes("margin_tpsl_cancel_all"));
  });

  it("includes all predict actions", () => {
    const names = ONCHAIN_ACTION_NAMES as readonly string[];
    assert.ok(names.includes("predict_deposit"));
    assert.ok(names.includes("predict_withdraw"));
    assert.ok(names.includes("predict_mint"));
    assert.ok(names.includes("predict_redeem"));
    assert.ok(names.includes("predict_mint_range"));
    assert.ok(names.includes("predict_redeem_range"));
    assert.ok(names.includes("predict_supply"));
    assert.ok(names.includes("predict_lp_withdraw"));
  });
});
