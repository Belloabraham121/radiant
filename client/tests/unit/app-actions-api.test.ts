import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isAppActionApprovalRequired,
  parseAppActionResultFromBody,
} from "../../src/lib/app-actions-api.ts";

describe("parseAppActionResultFromBody", () => {
  it("parses approval_required from API envelope", () => {
    const body = JSON.stringify({
      success: true,
      data: {
        status: "approval_required",
        action: "swap",
        agent_transaction_id: "00000000-0000-4000-8000-000000000010",
        pending: {
          id: "00000000-0000-4000-8000-000000000010",
          chain_id: "sui",
          action: "swap",
          params: { amount: 2, side: "sell" },
          summary: "Swap 2 SUI",
          amount_display: "2 SUI",
        },
      },
    });

    const result = parseAppActionResultFromBody(body);
    assert.ok(result);
    assert.equal(isAppActionApprovalRequired(result!), true);
    if (!result || !isAppActionApprovalRequired(result)) return;
    assert.equal(result.pending.id, "00000000-0000-4000-8000-000000000010");
    assert.equal(result.action, "swap");
  });

  it("parses executed result with digest", () => {
    const body = JSON.stringify({
      success: true,
      data: {
        status: "executed",
        action: "swap",
        digest: "abc123",
        explorer_url: "https://suiscan.xyz/mainnet/tx/abc123",
        result: { chain_id: "sui", digest: "abc123" },
      },
    });

    const result = parseAppActionResultFromBody(body);
    assert.equal(result?.status, "executed");
    if (result?.status !== "executed") return;
    assert.equal(result.digest, "abc123");
  });
});
