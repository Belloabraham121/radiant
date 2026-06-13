import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { after, before, describe, it } from "node:test";
import { createApp } from "../../src/app.js";

describe("agent permissions API", () => {
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

  for (const path of ["/api/v1/agent/permissions", "/api/v1/users/me/permissions"]) {
    it(`returns 401 for GET ${path} without privy-token cookie`, async () => {
      const response = await fetch(`${baseUrl}${path}`);
      assert.equal(response.status, 401);
    });

    it(`returns 401 for PATCH ${path} without privy-token cookie`, async () => {
      const response = await fetch(`${baseUrl}${path}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ auto_approve_enabled: false }),
      });
      assert.equal(response.status, 401);
    });
  }
});
