import assert from "node:assert/strict";
import type { Request, Response } from "express";
import { describe, it } from "node:test";
import { requireAuth } from "../../src/api/middleware/auth.js";
import { readAccessTokenFromRequest } from "../../src/services/auth/privy-auth.service.js";

function mockResponse(): Response {
  const res = {
    statusCode: 200,
    body: undefined as unknown,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.body = payload;
      return this;
    },
  };
  return res as unknown as Response;
}

describe("auth middleware", () => {
  it("readAccessTokenFromRequest returns null when cookie missing", () => {
    const req = { cookies: {} } as Request;
    assert.equal(readAccessTokenFromRequest(req), null);
  });

  it("requireAuth returns 401 when cookie missing", async () => {
    const req = {
      cookies: {},
      correlationId: "test-correlation",
    } as Request;
    const res = mockResponse();
    let nextCalled = false;

    await requireAuth(req, res, () => {
      nextCalled = true;
    });

    assert.equal(nextCalled, false);
    assert.equal(res.statusCode, 401);
    assert.deepEqual(
      (res.body as { error: { code: string } }).error.code,
      "UNAUTHORIZED",
    );
  });
});
