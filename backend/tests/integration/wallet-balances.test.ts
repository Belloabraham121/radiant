import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { after, before, describe, it } from "node:test";
import { createApp } from "../../src/app.js";

describe("GET /api/v1/wallets/balances", () => {
  let server: Server;
  let baseUrl: string;

  before(async () => {
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
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  });

  it("returns 401 without privy-token cookie", async () => {
    const response = await fetch(`${baseUrl}/api/v1/wallets/balances`);
    assert.equal(response.status, 401);

    const body = (await response.json()) as {
      success: boolean;
      error: { code: string };
    };
    assert.equal(body.success, false);
    assert.equal(body.error.code, "UNAUTHORIZED");
  });

  it("accepts ?chain=sui query without session (still 401)", async () => {
    const response = await fetch(`${baseUrl}/api/v1/wallets/balances?chain=sui`);
    assert.equal(response.status, 401);
  });
});
