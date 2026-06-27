import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isChatSessionBusy } from "../../src/lib/chat-session-busy";
import type { ChatMessage } from "../../src/lib/chat-messages";

const baseInput = {
  pendingTx: null,
  approving: false,
  streaming: false,
  pendingClarification: null,
  messages: [] as ChatMessage[],
};

describe("isChatSessionBusy", () => {
  it("returns true when a transaction is pending approval", () => {
    assert.equal(
      isChatSessionBusy({
        ...baseInput,
        pendingTx: {
          id: "tx-1",
          chain_id: "sui",
          action: "swap",
          params: {},
          summary: "Swap",
          amount_display: "1 SUI",
        },
      }),
      true,
    );
  });

  it("returns true while approving", () => {
    assert.equal(
      isChatSessionBusy({
        ...baseInput,
        approving: true,
      }),
      true,
    );
  });

  it("returns true for swap/bridge clarifications", () => {
    assert.equal(
      isChatSessionBusy({
        ...baseInput,
        pendingClarification: {
          id: "clarify-1",
          gap_id: "swap.amount",
          interaction_type: "input",
          question: "How much?",
          step_index: 0,
          kind: "intent",
        },
      }),
      true,
    );
  });

  it("returns true when execution steps are running", () => {
    const messages: ChatMessage[] = [
      {
        id: "m1",
        role: "agent",
        text: "Working",
        executionSteps: [{ id: "step-1", label: "Swap", status: "running" }],
      },
    ];

    assert.equal(
      isChatSessionBusy({
        ...baseInput,
        messages,
      }),
      true,
    );
  });

  it("returns false when idle", () => {
    assert.equal(isChatSessionBusy(baseInput), false);
  });
});
