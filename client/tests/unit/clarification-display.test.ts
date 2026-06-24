import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { clarificationAnswerDisplayText } from "../../src/lib/clarification-display";
import type { PendingClarification } from "../../src/lib/chat-api";

const chainChoicePending: PendingClarification = {
  id: "clarify-1",
  gap_id: "gap-1",
  interaction_type: "single_choice",
  question: "Which chain?",
  step_index: 0,
  kind: "intent",
  options: [
    { id: "evm:8453", label: "Base" },
    { id: "evm:42161", label: "Arbitrum" },
  ],
};

describe("clarificationAnswerDisplayText", () => {
  it("maps selected option id to label", () => {
    assert.equal(
      clarificationAnswerDisplayText(chainChoicePending, {
        selected_option_id: "evm:8453",
      }),
      "Base",
    );
  });

  it("maps multi-select ids to labels", () => {
    assert.equal(
      clarificationAnswerDisplayText(
        { ...chainChoicePending, interaction_type: "multi_choice" },
        { selected_option_ids: ["evm:8453", "evm:42161"] },
      ),
      "Base, Arbitrum",
    );
  });

  it("falls back to raw id when option is missing", () => {
    assert.equal(
      clarificationAnswerDisplayText(chainChoicePending, {
        selected_option_id: "evm:1",
      }),
      "evm:1",
    );
  });

  it("formats confirm and value answers", () => {
    assert.equal(
      clarificationAnswerDisplayText(
        { ...chainChoicePending, interaction_type: "confirm" },
        { confirm: "yes" },
      ),
      "Yes",
    );
    assert.equal(
      clarificationAnswerDisplayText(
        { ...chainChoicePending, interaction_type: "input" },
        { value: 42 },
      ),
      "42",
    );
  });
});
