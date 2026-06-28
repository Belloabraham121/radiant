import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isServerAutoApproveEligible,
  shouldAutoApprovePending,
} from "../../src/lib/auto-approve-pending";
import type { PendingTransaction } from "../../src/lib/chat-api";

const basePending: PendingTransaction = {
  id: "tx-1",
  chain_id: "ethereum",
  action: "cross_chain_swap",
  params: {},
  summary: "Bridge",
  amount_display: "1 USDC",
};

describe("auto-approve-pending", () => {
  it("isServerAutoApproveEligible respects server flag", () => {
    assert.equal(isServerAutoApproveEligible({ ...basePending, auto_approve_eligible: true }), true);
    assert.equal(isServerAutoApproveEligible(basePending), false);
  });

  it("shouldAutoApprovePending uses fiat preview when flag absent", () => {
    assert.equal(
      shouldAutoApprovePending(
        { ...basePending, fiat_preview: { legs: [], total_pay_usd: 10, total_receive_usd: 10, net_usd: 0, priced_at: null } },
        { auto_approve_enabled: true, auto_approve_max_usd: 25, allow_flash_loans: false, auto_approve_flash_loans: false, allow_governance: false, allow_margin: false, allow_predict: false },
      ),
      true,
    );
  });
});
