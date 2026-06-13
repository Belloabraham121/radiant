import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isDeepBookGovernanceAction,
  parseDeepBookSubmitProposalParams,
  parseDeepBookVoteParams,
} from "../../../src/services/defi/deepbook/deepbook-governance.service.js";
import { AppError } from "../../../src/errors/app-error.js";

describe("deepbook-governance.service", () => {
  it("recognizes governance actions", () => {
    assert.equal(isDeepBookGovernanceAction("deepbook_submit_proposal"), true);
    assert.equal(isDeepBookGovernanceAction("deepbook_vote"), true);
    assert.equal(isDeepBookGovernanceAction("deepbook_stake"), false);
  });

  it("parses submit proposal params", () => {
    const parsed = parseDeepBookSubmitProposalParams({
      pool_key: "SUI_USDC",
      taker_fee: 0.0001,
      maker_fee: 0.00005,
      stake_required: 100,
    });
    assert.equal(parsed.pool_key, "SUI_USDC");
    assert.equal(parsed.taker_fee, 0.0001);
    assert.equal(parsed.maker_fee, 0.00005);
    assert.equal(parsed.stake_required, 100);
  });

  it("parses vote params with proposal_id", () => {
    const proposalId = `0x${"a".repeat(64)}`;
    const parsed = parseDeepBookVoteParams({
      pool_key: "DEEP_USDC",
      proposal_id: proposalId,
    });
    assert.equal(parsed.pool_key, "DEEP_USDC");
    assert.equal(parsed.proposal_id, proposalId);
  });

  it("rejects invalid proposal_id", () => {
    assert.throws(
      () => parseDeepBookVoteParams({ pool_key: "SUI_USDC", proposal_id: "not-an-id" }),
      (err: unknown) => err instanceof AppError && err.code === "VALIDATION_ERROR",
    );
  });
});
