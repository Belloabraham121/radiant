import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { setRedisClientForTests } from "../../../src/infrastructure/redis/client.js";
import {
  emitAgentStreamExecuteInApp,
  shouldBroadcastAgentStream,
} from "../../../src/services/agent/agent-stream-execution.js";
import {
  resetAgentStreamForTests,
  subscribeAgentStream,
} from "../../../src/services/agent/agent-stream.service.js";
import {
  buildPreviewDelegatedResult,
  shouldDelegateAppActionToPreview,
} from "../../../src/services/projects/pinned-app-preview-delegation.js";
import { drainPendingExecuteInApp, resetPendingExecuteInAppForTests } from "../../../src/services/agent/agent-stream-pending-execute.js";

const sessionId = "00000000-0000-4000-8000-00000000a003";

describe("pinned-app preview delegation", () => {
  it("shouldDelegateAppActionToPreview when pinned scope + broadcast + session", () => {
    assert.equal(
      shouldDelegateAppActionToPreview({
        sessionId,
        broadcast: true,
        pinnedAppScope: { kind: "session_draft", name: "Swap UI" },
      }),
      true,
    );
    assert.equal(
      shouldDelegateAppActionToPreview({
        sessionId,
        broadcast: true,
      }),
      false,
    );
  });

  it("buildPreviewDelegatedResult includes app name and action", () => {
    const result = buildPreviewDelegatedResult("swap", {
      kind: "session_draft",
      name: "DeepBook Swap",
    });
    assert.equal(result.status, "preview_delegated");
    if (result.status !== "preview_delegated") return;
    assert.match(result.message, /DeepBook Swap/i);
    assert.match(result.message, /swap/i);
  });
});

describe("emitAgentStreamExecuteInApp", () => {
  before(async () => {
    setRedisClientForTests(null);
    await resetAgentStreamForTests();
    resetPendingExecuteInAppForTests();
  });

  after(async () => {
    await resetAgentStreamForTests();
    resetPendingExecuteInAppForTests();
    setRedisClientForTests(undefined);
  });

  it("emits execute_in_app agent_action when a subscriber is connected", () => {
    const events: Array<{ type: string; step?: string; action?: string }> = [];
    const unsubscribe = subscribeAgentStream(sessionId, (event) => {
      events.push({
        type: event.type,
        step: event.step,
        action: event.action,
      });
    });

    emitAgentStreamExecuteInApp(
      { sessionId, broadcast: true },
      "swap",
      { amount: 1.88, side: "buy" },
    );

    unsubscribe();
    assert.ok(
      events.some(
        (event) =>
          event.type === "agent_action" &&
          event.step === "execute_in_app" &&
          event.action === "swap",
      ),
    );
  });

  it("buffers execute_in_app when no subscriber is connected", () => {
    emitAgentStreamExecuteInApp(
      { sessionId, broadcast: true },
      "swap",
      { amount: 1, side: "sell" },
    );
    const pending = drainPendingExecuteInApp(sessionId);
    assert.equal(pending.length, 1);
    assert.equal(pending[0]?.action, "swap");
  });

  it("shouldBroadcastAgentStream without subscriber when broadcast is true", () => {
    assert.equal(shouldBroadcastAgentStream({ sessionId, broadcast: true }), true);
  });
});
