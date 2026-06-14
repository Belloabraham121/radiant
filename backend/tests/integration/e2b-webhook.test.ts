import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createServer, type Server } from "node:http";
import { after, before, describe, it } from "node:test";
import { createApp } from "../../src/app.js";
import { resetE2bWebhookConfigForTests } from "../../src/config/e2b.js";

function sign(secret: string, body: string): string {
  return createHash("sha256")
    .update(secret + body, "utf8")
    .digest("base64")
    .replace(/=+$/, "");
}

describe("POST /api/v1/webhooks/e2b", () => {
  let server: Server;
  let baseUrl: string;
  const originalSecret = process.env.E2B_WEBHOOK_SIGNATURE_SECRET;

  before(async () => {
    process.env.E2B_WEBHOOK_SIGNATURE_SECRET = "test-e2b-webhook-secret";
    resetE2bWebhookConfigForTests();

    const app = createApp();
    server = createServer(app);
    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", () => resolve());
    });
    const address = server.address();
    if (!address || typeof address === "string") {
      throw new Error("Failed to bind test server");
    }
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  after(async () => {
    process.env.E2B_WEBHOOK_SIGNATURE_SECRET = originalSecret;
    resetE2bWebhookConfigForTests();
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  });

  it("returns 400 when e2b-signature header is missing", async () => {
    const body = JSON.stringify({ type: "sandbox.lifecycle.created" });
    const response = await fetch(`${baseUrl}/api/v1/webhooks/e2b`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
    });

    assert.equal(response.status, 400);
    const payload = (await response.json()) as { error: { code: string } };
    assert.equal(payload.error.code, "INVALID_WEBHOOK");
  });

  it("accepts a signed lifecycle payload", async () => {
    const secret = "test-e2b-webhook-secret";
    const body = JSON.stringify({
      id: "evt-1",
      type: "sandbox.lifecycle.created",
      sandbox_id: "sb-123",
    });

    const response = await fetch(`${baseUrl}/api/v1/webhooks/e2b`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "e2b-signature": sign(secret, body),
      },
      body,
    });

    assert.equal(response.status, 200);
    const payload = (await response.json()) as {
      success: boolean;
      data: { event_type: string; reconcile: null };
    };
    assert.equal(payload.success, true);
    assert.equal(payload.data.event_type, "sandbox.lifecycle.created");
    assert.equal(payload.data.reconcile, null);
  });
});
