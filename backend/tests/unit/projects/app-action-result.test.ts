import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { AppError } from "../../../src/errors/app-error.js";
import {
  appActionResultToExecuteToolOutcome,
  buildAgentToolOptionsFromContext,
  mapExecuteOutcomeToAppActionResult,
  mapThrownErrorToAppActionResult,
} from "../../../src/services/projects/app-action-result.js";
import type { AppActionContext } from "../../../src/services/projects/app-action.types.js";

describe("app-action result mapping", () => {
  it("buildAgentToolOptionsFromContext passes session and approval flags", () => {
    const ctx: AppActionContext = {
      privyUserId: "did:privy:test",
      projectId: "00000000-0000-4000-8000-000000000001",
      sessionId: "00000000-0000-4000-8000-000000000099",
      messageId: "00000000-0000-4000-8000-000000000098",
      source: "ui",
      approved: true,
    };
    assert.deepEqual(buildAgentToolOptionsFromContext(ctx), {
      sessionId: ctx.sessionId,
      messageId: ctx.messageId,
      approved: true,
      broadcast: false,
    });
  });

  it("buildAgentToolOptionsFromContext enables broadcast for agent source", () => {
    const ctx: AppActionContext = {
      privyUserId: "did:privy:test",
      projectId: "00000000-0000-4000-8000-000000000001",
      sessionId: "00000000-0000-4000-8000-000000000099",
      source: "agent",
    };
    assert.deepEqual(buildAgentToolOptionsFromContext(ctx), {
      sessionId: ctx.sessionId,
      messageId: undefined,
      approved: undefined,
      broadcast: true,
    });
  });

  it("mapExecuteOutcomeToAppActionResult maps executed with explorer url", () => {
    const digest = "9GjRb8giW9T2V5JorAeMnpXu66KzzA6m5HeBkqf5EVrm";
    const result = mapExecuteOutcomeToAppActionResult("swap", {
      status: "executed",
      agent_transaction_id: "00000000-0000-4000-8000-000000000010",
      result: {
        chain_id: "sui",
        digest,
        address: "0xabc",
        effects_status: "success",
      },
    });

    assert.equal(result.status, "executed");
    if (result.status !== "executed") return;
    assert.equal(result.action, "swap");
    assert.equal(result.digest, digest);
    assert.match(result.explorer_url ?? "", /suiscan\.xyz\/mainnet\/tx\//);
    assert.equal(result.agent_transaction_id, "00000000-0000-4000-8000-000000000010");
  });

  it("mapExecuteOutcomeToAppActionResult maps approval_required", () => {
    const pending = {
      id: "00000000-0000-4000-8000-000000000011",
      chain_id: "sui" as const,
      action: "swap",
      params: { amount: 1, side: "sell" as const },
      summary: "Swap 1 SUI",
      amount_display: "1 SUI",
    };
    const result = mapExecuteOutcomeToAppActionResult("swap", {
      status: "approval_required",
      pending,
      agent_transaction_id: pending.id,
    });

    assert.equal(result.status, "approval_required");
    if (result.status !== "approval_required") return;
    assert.equal(result.pending.id, pending.id);
    assert.equal(result.agent_transaction_id, pending.id);
  });

  it("mapThrownErrorToAppActionResult preserves AppError code", () => {
    const result = mapThrownErrorToAppActionResult(
      "swap",
      new AppError(400, "VALIDATION_ERROR", "bad params"),
    );
    assert.equal(result.status, "error");
    if (result.status !== "error") return;
    assert.equal(result.error.code, "VALIDATION_ERROR");
    assert.equal(result.error.message, "bad params");
  });

  it("appActionResultToExecuteToolOutcome round-trips executed and approval", () => {
    const digest = "9GjRb8giW9T2V5JorAeMnpXu66KzzA6m5HeBkqf5EVrm";
    const executed = mapExecuteOutcomeToAppActionResult("swap", {
      status: "executed",
      result: {
        chain_id: "sui",
        digest,
        address: "0xabc",
        effects_status: "success",
      },
    });
    const roundTrip = appActionResultToExecuteToolOutcome(executed);
    assert.deepEqual(roundTrip, {
      status: "executed",
      result: {
        chain_id: "sui",
        digest,
        address: "0xabc",
        effects_status: "success",
      },
    });

    const approval = mapExecuteOutcomeToAppActionResult("swap", {
      status: "approval_required",
      pending: {
        id: "00000000-0000-4000-8000-000000000011",
        chain_id: "sui",
        action: "swap",
        params: {},
        summary: "Swap",
        amount_display: "1 SUI",
      },
    });
    assert.equal(appActionResultToExecuteToolOutcome(approval)?.status, "approval_required");
    assert.equal(
      appActionResultToExecuteToolOutcome({
        status: "error",
        action: "swap",
        error: { code: "X", message: "y" },
      }),
      null,
    );
  });
});
