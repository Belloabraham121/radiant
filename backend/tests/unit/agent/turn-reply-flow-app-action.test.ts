import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildReplyFromAppActionToolCalls,
  findLastToolError,
  hasSuccessfulAppActionResult,
} from "../../../src/services/agent/turn-reply-flow.js";
import { CALL_APP_ACTION_TOOL_NAME } from "../../../src/services/projects/call-app-action.tool.js";

describe("turn-reply-flow app action", () => {
  it("buildReplyFromAppActionToolCalls returns in-app approval message", () => {
    const reply = buildReplyFromAppActionToolCalls([
      {
        name: CALL_APP_ACTION_TOOL_NAME,
        action: "swap",
        result: {
          status: "approval_required",
          action: "swap",
          agent_transaction_id: "tx-1",
          pending: {
            id: "tx-1",
            chain_id: "sui",
            action: "swap",
            params: {},
            summary: "Swap",
            amount_display: "1 SUI",
          },
        },
      },
    ]);
    assert.match(reply ?? "", /app preview/i);
  });

  it("hasSuccessfulAppActionResult is true for approval_required", () => {
    assert.equal(
      hasSuccessfulAppActionResult([
        {
          name: CALL_APP_ACTION_TOOL_NAME,
          result: { status: "approval_required", action: "swap", agent_transaction_id: "x", pending: {} },
        },
      ]),
      true,
    );
  });

  it("findLastToolError maps call_app_action status error", () => {
    const err = findLastToolError([
      {
        name: CALL_APP_ACTION_TOOL_NAME,
        result: {
          status: "error",
          action: "swap",
          error: { code: "VALIDATION_ERROR", message: "Bad amount" },
        },
      },
    ]);
    assert.equal(err?.result.error.message, "Bad amount");
  });
});
