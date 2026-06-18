import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { after, before, describe, it } from "node:test";
import { createApp } from "../../src/app.js";

describe("notifications API auth", () => {
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

  const protectedRoutes = [
    { method: "GET", path: "/api/v1/notifications/preferences" },
    { method: "PATCH", path: "/api/v1/notifications/preferences", body: { enabled: true } },
    { method: "GET", path: "/api/v1/notifications/rules" },
    {
      method: "POST",
      path: "/api/v1/notifications/rules",
      body: { notification_type: "radiant.platform.agent_message", condition: {} },
    },
    {
      method: "GET",
      path: "/api/v1/projects/00000000-0000-4000-8000-000000000001/notifications/schema",
    },
    {
      method: "POST",
      path: "/api/v1/projects/00000000-0000-4000-8000-000000000001/notifications/rules",
      body: { notification_type: "opportunity_found", condition: { min_profit_bps: 1 } },
    },
    {
      method: "GET",
      path: "/api/v1/installations/00000000-0000-4000-8000-000000000002/notifications/rules",
    },
  ] as const;

  for (const route of protectedRoutes) {
    it(`returns 401 for ${route.method} ${route.path} without auth`, async () => {
      const response = await fetch(`${baseUrl}${route.path}`, {
        method: route.method,
        headers: route.body ? { "Content-Type": "application/json" } : undefined,
        body: route.body ? JSON.stringify(route.body) : undefined,
      });
      assert.equal(response.status, 401);
    });
  }
});
