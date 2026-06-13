import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { describe, it } from "node:test";
import { verifyE2bWebhookSignature } from "../../../src/services/sandbox/e2b-webhook-signature.js";

function sign(secret: string, body: string): string {
  return createHash("sha256")
    .update(secret + body, "utf8")
    .digest("base64")
    .replace(/=+$/, "");
}

describe("verifyE2bWebhookSignature", () => {
  it("accepts a valid E2B signature", () => {
    const secret = "test-secret";
    const body = '{"type":"sandbox.lifecycle.killed"}';
    assert.equal(verifyE2bWebhookSignature(secret, body, sign(secret, body)), true);
  });

  it("rejects tampered payloads", () => {
    const secret = "test-secret";
    const body = '{"type":"sandbox.lifecycle.killed"}';
    assert.equal(verifyE2bWebhookSignature(secret, body, sign(secret, '{"type":"other"}')), false);
  });
});
