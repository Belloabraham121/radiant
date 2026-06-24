import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  validateCallApiToolPolicy,
  validateExecuteTransactionToolPolicy,
} from "../../../src/services/agent/tool-arg-policy.js";

describe("tool-arg-policy", () => {
  it("rejects call_api Authorization header", () => {
    assert.throws(
      () =>
        validateCallApiToolPolicy({
          url: "https://example.com",
          headers: { Authorization: "Bearer secret" },
        }),
      (err: Error & { code?: string }) => {
        assert.equal(err.code, "POLICY_VIOLATION");
        return true;
      },
    );
  });

  it("rejects invalid execute_bytes payload", () => {
    assert.throws(
      () =>
        validateExecuteTransactionToolPolicy({
          chain_id: "sui",
          action: "execute_bytes",
          params: { transaction_bytes: "not!!!base64" },
        }),
      (err: Error & { code?: string }) => {
        assert.equal(err.code, "POLICY_VIOLATION");
        return true;
      },
    );
  });

  it("rejects transfer without recipient", () => {
    assert.throws(
      () =>
        validateExecuteTransactionToolPolicy({
          chain_id: "sui",
          action: "transfer_native",
          params: { amount_atomic: "1" },
        }),
      (err: Error & { code?: string }) => {
        assert.equal(err.code, "POLICY_VIOLATION");
        return true;
      },
    );
  });
});
