import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { AppError } from "../../../src/errors/app-error.js";
import { mapApprovalOutcomeToApiResult } from "../../../src/services/projects/app-action-approval.service.js";

describe("app-action approval service", () => {
  it("mapApprovalOutcomeToApiResult maps executed outcome", () => {
    const result = mapApprovalOutcomeToApiResult("tx-1", {
      ok: true,
      pending: {
        id: "tx-1",
        chain_id: "sui",
        action: "swap",
        params: {},
        summary: "Swap",
        amount_display: "1 SUI",
      },
      result: {
        chain_id: "sui",
        digest: "0xabc",
        effects_status: "success",
      },
    });

    assert.equal(result.status, "executed");
    if (result.status !== "executed") return;
    assert.equal(result.agent_transaction_id, "tx-1");
    assert.equal(result.digest, "0xabc");
    assert.ok(result.explorer_url?.includes("0xabc"));
  });

  it("mapApprovalOutcomeToApiResult maps execution error outcome", () => {
    const result = mapApprovalOutcomeToApiResult("tx-2", {
      ok: false,
      pending: {
        id: "tx-2",
        chain_id: "sui",
        action: "swap",
        params: {},
        summary: "Swap",
        amount_display: "1 SUI",
      },
      error: new AppError(400, "QUOTE_EXPIRED", "Quote expired"),
    });

    assert.equal(result.status, "error");
    if (result.status !== "error") return;
    assert.equal(result.error.code, "QUOTE_EXPIRED");
  });
});
