import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { after, before, describe, it } from "node:test";
import { createApp } from "../../src/app.js";
import { prisma } from "../../src/infrastructure/postgres/client.js";

describe("POST /api/v1/waitlist", () => {
  let server: Server;
  let baseUrl: string;
  const testEmail = "waitlist-integration@radiant.dev";

  before(async () => {
    await prisma.waitlistEmail.deleteMany({ where: { email: testEmail } });
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
    await prisma.waitlistEmail.deleteMany({ where: { email: testEmail } });
    await prisma.$disconnect();
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  });

  it("returns 400 for invalid email", async () => {
    const response = await fetch(`${baseUrl}/api/v1/waitlist`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "not-an-email" }),
    });
    assert.equal(response.status, 400);
    const body = (await response.json()) as {
      success: boolean;
      error: { code: string } | null;
    };
    assert.equal(body.success, false);
    assert.equal(body.error?.code, "VALIDATION_ERROR");
  });

  it("creates a waitlist signup", async () => {
    const response = await fetch(`${baseUrl}/api/v1/waitlist`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: testEmail, source: "hero" }),
    });
    assert.equal(response.status, 201);
    const body = (await response.json()) as {
      success: boolean;
      data: { email: string; created: boolean } | null;
    };
    assert.equal(body.success, true);
    assert.equal(body.data?.email, testEmail);
    assert.equal(body.data?.created, true);
  });

  it("is idempotent on duplicate email", async () => {
    const response = await fetch(`${baseUrl}/api/v1/waitlist`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: testEmail, source: "footer" }),
    });
    assert.equal(response.status, 200);
    const body = (await response.json()) as {
      success: boolean;
      data: { email: string; created: boolean } | null;
    };
    assert.equal(body.success, true);
    assert.equal(body.data?.email, testEmail);
    assert.equal(body.data?.created, false);
  });
});
