import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { after, before, describe, it } from "node:test";
import { createApp } from "../../src/app.js";

describe("GET /api/v1/chat/sessions/:sessionId/agent-stream", () => {
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
    const response = await fetch(
      `${baseUrl}/api/v1/chat/sessions/00000000-0000-4000-8000-000000000001/agent-stream`,
      {
        headers: { Accept: "text/event-stream" },
      },
    );
    assert.equal(response.status, 401);
  });
});
