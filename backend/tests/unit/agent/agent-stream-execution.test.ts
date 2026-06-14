import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { setRedisClientForTests } from "../../../src/infrastructure/redis/client.js";
import {
  agentStreamContextFromAppAction,
  agentStreamContextFromToolOptions,
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

  it("shouldBroadcastAgentStream requires sessionId, broadcast, and an active subscriber", () => {
    assert.equal(
      shouldBroadcastAgentStream({ sessionId, broadcast: true }),
      false,
    );

    const unsubscribe = subscribeAgentStream(sessionId, () => undefined);
    assert.equal(
      shouldBroadcastAgentStream({ sessionId, broadcast: true }),
      true,
    );
    assert.equal(
      shouldBroadcastAgentStream({ sessionId, broadcast: false }),
      false,
    );
    unsubscribe();
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
