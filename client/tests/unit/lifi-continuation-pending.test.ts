import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { AgentTransactionDetail, AgentTransactionListItem } from "@/lib/agent-transactions-api";
import {
  isLifiContinuationPendingTx,
  pendingTransactionFromAgentDetail,
  pickClaimableLifiContinuationPending,
} from "@/lib/lifi-continuation-pending";

function listItem(
  overrides: Partial<AgentTransactionListItem> & Pick<AgentTransactionListItem, "id">,
): AgentTransactionListItem {
  return {
    status: "pending_approval",
    category: "swap",
    chain_id: "sui",
    title: "Sign destination transaction",
    amount_display: "1 SUI → 0.9 USDC",
    digest: null,
    explorer_url: null,
    effects_status: null,
    session_id: "sess-1",
    message_id: null,
    created_at: "2026-01-01T00:00:00.000Z",
    completed_at: null,
    ...overrides,
  };
}

function detailFromList(
  item: AgentTransactionListItem,
  params: Record<string, unknown>,
): AgentTransactionDetail {
  return {
    ...item,
    action: "cross_chain_swap",
    params,
    wallet_address: "0xabc",
    workflow_step_index: null,
    result: null,
    error_code: null,
    error_message: null,
    submitted_at: null,
  };
}

describe("lifi-continuation-pending client helpers", () => {
  it("filters pending_approval continuation rows", () => {
    const continuation = detailFromList(listItem({ id: "tx-1" }), {
      lifi_continuation: true,
      approval_kind: "lifi_continue",
      route_id: "r1",
    });
    const initial = detailFromList(listItem({ id: "tx-2" }), {
      route_id: "r2",
      expires_at: new Date(Date.now() + 60_000).toISOString(),
    });
    const submitted = detailFromList(
      listItem({ id: "tx-3", status: "submitted" }),
      { lifi_continuation: true, approval_kind: "lifi_continue" },
    );

    assert.equal(isLifiContinuationPendingTx(continuation), true);
    assert.equal(isLifiContinuationPendingTx(initial), false);
    assert.equal(isLifiContinuationPendingTx(submitted), false);
  });

  it("picks the most recent claimable continuation", () => {
    const older = detailFromList(
      listItem({
        id: "tx-old",
        created_at: "2026-01-01T00:00:00.000Z",
      }),
      { lifi_continuation: true, route_id: "r1" },
    );
    const newer = detailFromList(
      listItem({
        id: "tx-new",
        created_at: "2026-01-02T00:00:00.000Z",
      }),
      { approval_kind: "lifi_continue", route_id: "r2" },
    );

    const picked = pickClaimableLifiContinuationPending([older, newer]);
    assert.equal(picked?.id, "tx-new");
  });

  it("maps agent detail to PendingTransaction without quote expiry", () => {
    const detail = detailFromList(listItem({ id: "tx-1" }), {
      lifi_continuation: true,
      approval_kind: "lifi_continue",
    });

    const pending = pendingTransactionFromAgentDetail(detail);

    assert.ok(pending);
    assert.equal(pending!.quote_expires_at, null);
    assert.equal(pending!.action, "cross_chain_swap");
  });
});
