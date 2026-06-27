import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { AppError } from "../../../src/errors/app-error.js";
import {
  persistRefreshedPendingQuote,
  setUpdateAgentTransactionByIdForTests,
} from "../../../src/services/agent/transaction-approval.service.js";

describe("persistRefreshedPendingQuote", () => {
  afterEach(() => {
    setUpdateAgentTransactionByIdForTests(null);
  });

  it("throws APPROVAL_UPDATE_FAILED when the DB update returns null", async () => {
    setUpdateAgentTransactionByIdForTests(async () => null);

    await assert.rejects(
      persistRefreshedPendingQuote("00000000-0000-4000-8000-000000000001", {
        id: "00000000-0000-4000-8000-000000000001",
        chain_id: "ethereum",
        action: "cross_chain_swap",
        summary: "Bridge",
        amount_display: "1 USDC",
        params: { route_id: "route-1" },
      }),
      (err: unknown) =>
        err instanceof AppError && err.code === "APPROVAL_UPDATE_FAILED",
    );
  });
});
