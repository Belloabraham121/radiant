import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { after, before, describe, it } from "node:test";
import { createApp } from "../../src/app.js";

describe("project actions API", () => {
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

  it("returns 401 for GET /api/v1/projects/:projectId/actions without privy-token cookie", async () => {
    const response = await fetch(
      `${baseUrl}/api/v1/projects/00000000-0000-4000-8000-000000000001/actions`,
    );
    assert.equal(response.status, 401);
  });

  it("returns 401 for POST /api/v1/projects/:projectId/actions/:action without privy-token cookie", async () => {
    const response = await fetch(
      `${baseUrl}/api/v1/projects/00000000-0000-4000-8000-000000000001/actions/swap`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ side: "sell", amount: 1 }),
      },
    );
    assert.equal(response.status, 401);
  });
});

describe("installation actions API", () => {
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

  it("returns 401 for GET /api/v1/installations/:installationId/actions without privy-token cookie", async () => {
    const response = await fetch(
      `${baseUrl}/api/v1/installations/00000000-0000-4000-8000-000000000002/actions`,
    );
    assert.equal(response.status, 401);
  });

  it("returns 401 for POST /api/v1/installations/:installationId/actions/:action without privy-token cookie", async () => {
    const response = await fetch(
      `${baseUrl}/api/v1/installations/00000000-0000-4000-8000-000000000002/actions/swap`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ side: "sell", amount: 1 }),
      },
    );
    assert.equal(response.status, 401);
  });
});
