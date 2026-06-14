import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { setRedisClientForTests } from "../../../src/infrastructure/redis/client.js";
import {
  emitAgentEvent,
  hasAgentStreamSubscribers,
  resetAgentStreamForTests,
  subscribeAgentStream,
} from "../../../src/services/agent/agent-stream.service.js";

const sessionId = "00000000-0000-4000-8000-00000000a001";

describe("agent-stream.service", () => {
  before(async () => {
    setRedisClientForTests(null);
    await resetAgentStreamForTests();
  });

  after(async () => {
    await resetAgentStreamForTests();
    setRedisClientForTests(undefined);
  });

  it("emitAgentEvent delivers events to in-memory subscribers", () => {
    const received: unknown[] = [];
    const unsubscribe = subscribeAgentStream(sessionId, (event) => {
      received.push(event);
    });

    assert.equal(hasAgentStreamSubscribers(sessionId), true);

    emitAgentEvent(sessionId, "agent_thinking", { active: true });
    emitAgentEvent(sessionId, "agent_action", {
      action: "swap",
      params: { amount: 2, side: "sell" },
      animate: true,
    });
    emitAgentEvent(sessionId, "agent_step", { target: "amount-in", value: 2 });
    emitAgentEvent(sessionId, "agent_done", { digest: "abc123", refresh: true });
    emitAgentEvent(sessionId, "agent_error", { code: "EXEC_FAILED", message: "boom" });

    unsubscribe();
    assert.equal(hasAgentStreamSubscribers(sessionId), false);
    assert.equal(received.length, 5);

    const thinking = received[0] as { type: string; session_id: string; active?: boolean };
    assert.equal(thinking.type, "agent_thinking");
    assert.equal(thinking.session_id, sessionId);
    assert.equal(thinking.active, true);

    const action = received[1] as {
      type: string;
      action?: string;
      params?: Record<string, unknown>;
      animate?: boolean;
    };
    assert.equal(action.type, "agent_action");
    assert.equal(action.action, "swap");
    assert.equal(action.params?.amount, 2);
    assert.equal(action.animate, true);

    const done = received[3] as { digest?: string; refresh?: boolean };
    assert.equal(done.digest, "abc123");
    assert.equal(done.refresh, true);
  });

  it("emitAgentEvent is best-effort when no subscribers are connected", () => {
    assert.doesNotThrow(() => {
      emitAgentEvent(sessionId, "agent_thinking", { active: true });
    });
  });

  it("unsubscribe stops delivery", () => {
    const received: unknown[] = [];
    const unsubscribe = subscribeAgentStream(sessionId, (event) => {
      received.push(event);
    });

    emitAgentEvent(sessionId, "agent_thinking", { active: true });
    unsubscribe();
    emitAgentEvent(sessionId, "agent_done", { digest: "late" });

    assert.equal(received.length, 1);
  });
});
