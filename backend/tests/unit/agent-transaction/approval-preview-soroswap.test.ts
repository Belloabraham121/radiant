import assert from "node:assert/strict";
import { afterEach, before, describe, it } from "node:test";
import { defaultAgentPermissions } from "../../../src/services/agent/agent-permissions.service.js";
import { transferRequiresApprovalWithPermissions } from "../../../src/services/agent/transaction-approval.service.js";
import {
  mockUnitUsdPricesForAutoApproveTests,
  resetAutoApprovePriceMocksForTests,
} from "../../helpers/auto-approve-prices.js";

describe("soroswap approval — USD threshold", () => {
  before(() => {
    process.env.COINGECKO_API_KEY = "CG-test-key";
    mockUnitUsdPricesForAutoApproveTests();
  });

  afterEach(() => {
    resetAutoApprovePriceMocksForTests();
    mockUnitUsdPricesForAutoApproveTests();
  });

  it("auto-approves small stellar_swap below USD threshold", async () => {
    assert.equal(
      await transferRequiresApprovalWithPermissions(defaultAgentPermissions(), {
        chain_id: "stellar",
        action: "stellar_swap",
        params: {
          token_in: "USDC",
          token_out: "XLM",
          from_amount_display: 10,
          to_amount_display: 50,
        },
      }),
      false,
    );
  });

  it("requires approval for large stellar_swap above USD threshold", async () => {
    assert.equal(
      await transferRequiresApprovalWithPermissions(defaultAgentPermissions(), {
        chain_id: "stellar",
        action: "stellar_swap",
        params: {
          token_in: "USDC",
          token_out: "XLM",
          from_amount_display: 100,
          to_amount_display: 500,
        },
      }),
      true,
    );
  });
});
