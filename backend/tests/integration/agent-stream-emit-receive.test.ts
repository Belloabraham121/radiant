import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { setRedisClientForTests } from "../../src/infrastructure/redis/client.js";
import type { AgentStreamEvent } from "../../src/services/agent/agent-stream.types.js";
import {
  resetAgentStreamForTests,
  subscribeAgentStream,
} from "../../src/services/agent/agent-stream.service.js";
import {
  runExecuteTransactionToolWithApproval,
  setExecuteTransactionWithApprovalHandlerForTests,
} from "../../src/services/agent/execute-transaction-with-approval.js";

const sessionId = "00000000-0000-4000-8000-00000000a003";

describe("agent stream emit → subscriber", () => {
  before(async () => {
    setRedisClientForTests(null);
    await resetAgentStreamForTests();
  });

  after(async () => {
    setExecuteTransactionWithApprovalHandlerForTests(null);
    await resetAgentStreamForTests();
    setRedisClientForTests(undefined);
  });

  it("delivers ordered lifecycle events from execute hook to in-process subscriber", async () => {
    const received: AgentStreamEvent[] = [];
    const unsubscribe = subscribeAgentStream(sessionId, (event) => {
      received.push(event);
    });

    setExecuteTransactionWithApprovalHandlerForTests(async () => ({
      status: "executed",
      result: {
        chain_id: "sui",
        digest: "integration-stream-digest",
        address: "0xabc",
        effects_status: "success",
      },
    }));

    await runExecuteTransactionToolWithApproval(
      "did:privy:agent-stream-integration",
      {
        chain_id: "sui",
        action: "swap",
        params: { amount: 2, side: "sell", pool_key: "SUI_USDC" },
      },
      { sessionId, broadcast: true },
    );

    unsubscribe();

    const types = received.map((event) => event.type);
    assert.deepEqual(types, [
      "agent_thinking",
      "agent_action",
      "agent_step",
      "agent_step",
      "agent_done",
      "agent_thinking",
    ]);

    const done = received.find((event) => event.type === "agent_done");
    assert.ok(done);
    assert.equal(done?.digest, "integration-stream-digest");
    assert.equal(done?.refresh, true);
    assert.equal(done?.action, "swap");
  });
});
