import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  messageHasBuildAppIntent,
  messageHasExecutableSwapIntent,
  messageRequestsSaveToProjects,
} from "../../../src/services/agent/workflow/workflow-parser.js";
import { looksLikeWorkflowMessage } from "../../../src/services/agent/workflow/heuristic-planner.js";

describe("build app intent detection", () => {
  it("detects DeepBook swap app build requests", () => {
    const message =
      "Build a DeepBook swap app like Uniswap with tabs for swap, flash loan, stake, and orders. Save it to my projects.";
    assert.equal(messageHasBuildAppIntent(message), true);
    assert.equal(messageRequestsSaveToProjects(message), true);
    assert.equal(looksLikeWorkflowMessage(message), false);
  });

  it("does not treat concrete swap amounts as build", () => {
    assert.equal(messageHasExecutableSwapIntent("swap 1.5 SUI to USDC"), true);
    assert.equal(messageHasBuildAppIntent("swap 1.5 SUI to USDC"), false);
  });

  it("does not treat build-a-swap-ui as workflow", () => {
    assert.equal(
      looksLikeWorkflowMessage("build a swap like uniswap with different components"),
      false,
    );
  });
});
