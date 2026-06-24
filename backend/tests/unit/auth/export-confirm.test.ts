import assert from "node:assert/strict";
import type { NextFunction, Request, Response } from "express";
import { describe, it, mock } from "node:test";
import {
  auditUserDataExport,
  requireExportConfirmHeader,
} from "../../../src/api/middleware/export-confirm.js";

function mockResponse() {
  return {} as Response;
}

describe("export confirm middleware", () => {
  it("rejects export without X-Export-Confirm header", () => {
    const req = {
      get(name: string) {
        if (name === "x-export-confirm") return undefined;
        return undefined;
      },
    } as Request;
    const next = mock.fn() as NextFunction;

    requireExportConfirmHeader(req, mockResponse(), next);

    assert.equal(next.mock.calls.length, 1);
    const err = next.mock.calls[0]?.arguments[0] as Error & { code?: string };
    assert.equal(err.code, "EXPORT_CONFIRM_REQUIRED");
  });

  it("allows export when X-Export-Confirm is true", () => {
    const req = {
      get(name: string) {
        if (name === "x-export-confirm") return "true";
        return undefined;
      },
    } as Request;
    const next = mock.fn() as NextFunction;

    requireExportConfirmHeader(req, mockResponse(), next);

    assert.equal(next.mock.calls.length, 1);
    assert.equal(next.mock.calls[0]?.arguments[0], undefined);
  });
});

describe("auditUserDataExport", () => {
  it("does not throw when logging export audit", () => {
    assert.doesNotThrow(() => {
      auditUserDataExport("did:privy:test", "corr-123");
    });
  });
});
