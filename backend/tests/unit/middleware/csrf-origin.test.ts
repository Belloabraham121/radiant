import assert from "node:assert/strict";
import type { NextFunction, Request, Response } from "express";
import { describe, it, mock } from "node:test";
import { csrfOriginMiddleware } from "../../../src/api/middleware/csrf-origin.js";

function mockResponse() {
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
  return res as Response & { statusCode: number; body: unknown };
}

describe("csrfOriginMiddleware", () => {
  const originalNodeEnv = process.env.NODE_ENV;

  it("allows matching Origin on POST", () => {
    process.env.NODE_ENV = "development";
    const req = {
      method: "POST",
      path: "/api/v1/chat",
      get(name: string) {
        if (name === "origin") return "http://localhost:3000";
        return undefined;
      },
    } as Request;
    const res = mockResponse();
    const next = mock.fn() as NextFunction;

    csrfOriginMiddleware(req, res, next);
    assert.equal(next.mock.calls.length, 1);
  });

  it("blocks mismatched Origin on POST", () => {
    process.env.NODE_ENV = "development";
    const req = {
      method: "POST",
      path: "/api/v1/chat",
      get(name: string) {
        if (name === "origin") return "https://evil.example";
        return undefined;
      },
    } as Request;
    const res = mockResponse();
    const next = mock.fn() as NextFunction;

    csrfOriginMiddleware(req, res, next);
    assert.equal(next.mock.calls.length, 0);
    assert.equal(res.statusCode, 403);
  });

  it("allows POST without Origin header (non-browser clients)", () => {
    process.env.NODE_ENV = "development";
    const req = {
      method: "POST",
      path: "/api/v1/chat",
      get() {
        return undefined;
      },
    } as Request;
    const res = mockResponse();
    const next = mock.fn() as NextFunction;

    csrfOriginMiddleware(req, res, next);
    assert.equal(next.mock.calls.length, 1);
  });

  it("skips GET requests", () => {
    process.env.NODE_ENV = "development";
    const req = {
      method: "GET",
      path: "/api/v1/auth/me",
      get() {
        return undefined;
      },
    } as Request;
    const res = mockResponse();
    const next = mock.fn() as NextFunction;

    csrfOriginMiddleware(req, res, next);
    assert.equal(next.mock.calls.length, 1);
  });

  it("skips webhook routes", () => {
    process.env.NODE_ENV = "development";
    const req = {
      method: "POST",
      path: "/api/v1/webhooks/privy",
      get() {
        return undefined;
      },
    } as Request;
    const res = mockResponse();
    const next = mock.fn() as NextFunction;

    csrfOriginMiddleware(req, res, next);
    assert.equal(next.mock.calls.length, 1);
  });

  it("skips validation in test environment", () => {
    process.env.NODE_ENV = "test";
    const req = {
      method: "POST",
      path: "/api/v1/chat",
      get() {
        return "https://evil.example";
      },
    } as Request;
    const res = mockResponse();
    const next = mock.fn() as NextFunction;

    csrfOriginMiddleware(req, res, next);
    assert.equal(next.mock.calls.length, 1);
    process.env.NODE_ENV = originalNodeEnv;
  });
});
