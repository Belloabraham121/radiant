import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import {
  clearAllClarificationsForTests,
  getClarificationById,
  getSessionClarification,
  restoreClarification,
} from "../../../src/services/agent/workflow/clarification.store.js";
import {
  clearAllSessionWorkflowsForTests,
  getSessionWorkflow,
  restoreSessionWorkflow,
} from "../../../src/services/agent/workflow/session-workflow.store.js";
import type { SessionClarificationState } from "../../../src/services/agent/workflow/clarification.types.js";
import type { SessionWorkflowState } from "../../../src/services/agent/workflow/workflow.types.js";

describe("session-state restore (rehydration after restart)", () => {
  afterEach(() => {
    clearAllClarificationsForTests();
    clearAllSessionWorkflowsForTests();
  });

  it("restoreClarification re-inserts by id and session without minting a new id", () => {
    const state = {
      id: "clar-123",
      sessionId: "sess-abc",
      gap: { gap_id: "chain", interaction_type: "single_choice", question: "Which chain?", step_index: 0, kind: "intent" },
      plan: { steps: [] },
      context: "swap_intent",
      createdAt: Date.now(),
    } as unknown as SessionClarificationState;

    // Simulate a fresh process: nothing in memory yet.
    assert.equal(getClarificationById("clar-123"), null);

    restoreClarification(state);

    // Looked up by the original id (what the client sends back) and by session.
    assert.equal(getClarificationById("clar-123")?.id, "clar-123");
    assert.equal(getSessionClarification("sess-abc")?.id, "clar-123");
  });

  it("restoreSessionWorkflow re-inserts a paused workflow run by session", () => {
    const state = {
      sessionId: "sess-xyz",
      plan: { steps: [] },
      currentStepIndex: 1,
      completed: [],
      ledger: [],
      status: "paused_approval",
      pendingTransactionId: "tx-1",
      createdAt: Date.now(),
    } as unknown as SessionWorkflowState;

    assert.equal(getSessionWorkflow("sess-xyz"), null);

    restoreSessionWorkflow(state);

    const restored = getSessionWorkflow("sess-xyz");
    assert.equal(restored?.status, "paused_approval");
    assert.equal(restored?.pendingTransactionId, "tx-1");
    assert.equal(restored?.currentStepIndex, 1);
  });
});
