import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { setRedisClientForTests } from "../../../src/infrastructure/redis/client.js";
import {
  agentStreamContextFromAppAction,
  agentStreamContextFromToolOptions,
  emitAgentStreamExecutionOutcome,
  emitAgentStreamExecutionStart,
  shouldBroadcastAgentStream,
} from "../../../src/services/agent/agent-stream-execution.js";
import {
  resetAgentStreamForTests,
  subscribeAgentStream,
} from "../../../src/services/agent/agent-stream.service.js";
import { setExecuteTransactionWithApprovalHandlerForTests } from "../../../src/services/agent/execute-transaction-with-approval.js";

const sessionId = "00000000-0000-4000-8000-00000000a002";

describe("agent-stream execution hooks", () => {
  before(async () => {
    setRedisClientForTests(null);
    await resetAgentStreamForTests();
  });

  after(async () => {
    setExecuteTransactionWithApprovalHandlerForTests(null);
    await resetAgentStreamForTests();
    setRedisClientForTests(undefined);
  });

  it("shouldBroadcastAgentStream requires sessionId and broadcast flag", () => {
    assert.equal(
      shouldBroadcastAgentStream({ sessionId, broadcast: true }),
      true,
    );
    assert.equal(
      shouldBroadcastAgentStream({ sessionId, broadcast: false }),
      false,
    );
    assert.equal(
      shouldBroadcastAgentStream({ broadcast: true }),
      false,
    );
  });

  it("agentStreamContextFromAppAction broadcasts only for agent source", () => {
    assert.deepEqual(
      agentStreamContextFromAppAction({
        privyUserId: "did:privy:test",
        source: "agent",
        sessionId,
      }),
      { sessionId, broadcast: true },
    );
    assert.deepEqual(
      agentStreamContextFromAppAction({
        privyUserId: "did:privy:test",
        source: "ui",
        sessionId,
      }),
      { sessionId, broadcast: false },
    );
  });

  it("agentStreamContextFromToolOptions requires explicit broadcast flag", () => {
    assert.deepEqual(
      agentStreamContextFromToolOptions({ sessionId, broadcast: true }),
      { sessionId, broadcast: true },
    );
    assert.deepEqual(
      agentStreamContextFromToolOptions({ sessionId }),
      { sessionId, broadcast: false },
    );
  });

  it("emitAgentStreamExecutionStart emits semantic action + swap steps", () => {
    const events: string[] = [];
    const unsubscribe = subscribeAgentStream(sessionId, (event) => {
      events.push(event.type);
    });

    emitAgentStreamExecutionStart(
      { sessionId, broadcast: true },
      "swap",
      { amount: 2, side: "sell" },
    );

    unsubscribe();
    assert.deepEqual(events, [
      "agent_thinking",
      "agent_action",
      "agent_step",
      "agent_step",
    ]);
  });

  it("emitAgentStreamExecutionOutcome emits approval_required for in-app modal", () => {
    const events: Array<{ type: string; step?: string; pending?: unknown }> = [];
    const unsubscribe = subscribeAgentStream(sessionId, (event) => {
      events.push({
        type: event.type,
        step: event.step,
        pending: event.pending,
      });
    });

    emitAgentStreamExecutionOutcome(
      { sessionId, broadcast: true },
      "swap",
      {
        status: "approval_required",
        pending: {
          id: "pending-1",
          chain_id: "sui",
          action: "swap",
          params: { amount: 1.6, side: "sell" },
          summary: "Swap 1.6 SUI",
          amount_display: "1.6 SUI",
        },
        agent_transaction_id: "pending-1",
      },
    );

    unsubscribe();
    assert.ok(
      events.some(
        (event) =>
          event.type === "agent_action" &&
          event.step === "approval_required" &&
          event.pending !== undefined,
      ),
    );
    assert.ok(events.some((event) => event.type === "agent_thinking"));
  });
});

describe("runExecuteTransactionToolWithApproval agent stream", () => {
  before(async () => {
    setRedisClientForTests(null);
    await resetAgentStreamForTests();
  });

  after(async () => {
    setExecuteTransactionWithApprovalHandlerForTests(null);
    await resetAgentStreamForTests();
    setRedisClientForTests(undefined);
  });

  it("emits lifecycle events when broadcast is enabled and a subscriber is connected", async () => {
    const events: Array<{ type: string; action?: string; digest?: string }> = [];
    const unsubscribe = subscribeAgentStream(sessionId, (event) => {
      events.push({
        type: event.type,
        action: event.action,
        digest: event.digest,
      });
    });

    setExecuteTransactionWithApprovalHandlerForTests(async () => ({
      status: "executed",
      result: {
        chain_id: "sui",
        digest: "stream-hook-digest",
        address: "0xabc",
        effects_status: "success",
      },
    }));

    const { runExecuteTransactionToolWithApproval } = await import(
      "../../../src/services/agent/execute-transaction-with-approval.js"
    );

    await runExecuteTransactionToolWithApproval(
      "did:privy:stream-hook",
      {
        chain_id: "sui",
        action: "swap",
        params: { amount: 2, side: "sell" },
      },
      { sessionId, broadcast: true },
    );

    unsubscribe();
    assert.ok(events.some((event) => event.type === "agent_action" && event.action === "swap"));
    assert.ok(events.some((event) => event.type === "agent_done" && event.digest === "stream-hook-digest"));
  });
});
