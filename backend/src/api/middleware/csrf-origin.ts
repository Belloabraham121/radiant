import type { NextFunction, Request, Response } from "express";
import { getCorsEnv } from "../../config/env.js";
import { AppError } from "../../errors/app-error.js";
import { fail } from "../../utils/http-response.js";

const MUTATION_METHODS = new Set(["POST", "PATCH", "DELETE", "PUT"]);

const CSRF_EXEMPT_PREFIXES = [
  "/api/v1/webhooks/",
  "/api/inngest",
  "/health",
];

function isExemptPath(path: string): boolean {
  return CSRF_EXEMPT_PREFIXES.some((prefix) => path.startsWith(prefix));
}

function normalizeOrigin(value: string): string {
  try {
    return new URL(value).origin;
  } catch {
    return value.replace(/\/$/, "");
  }
}

function originFromReferer(referer: string): string | null {
  try {
    return new URL(referer).origin;
  } catch {
    return null;
  }
}

function requestOrigin(req: Request): string | null {
  const origin = req.get("origin");
  if (origin) {
    return normalizeOrigin(origin);
  }

  const referer = req.get("referer");
  if (referer) {
    return originFromReferer(referer);
  }

  return null;
}

/** Validates Origin/Referer on cookie-authenticated mutations (CSRF defense-in-depth). */
export function csrfOriginMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (process.env.NODE_ENV === "test") {
    next();
    return;
  }

  if (!MUTATION_METHODS.has(req.method.toUpperCase())) {
    next();
    return;
  }

  if (isExemptPath(req.path)) {
    next();
    return;
  }

  const allowedOrigin = normalizeOrigin(getCorsEnv().corsOrigin);
  const origin = requestOrigin(req);

  if (!origin) {
    next();
    return;
  }

  if (origin !== allowedOrigin) {
    const err = new AppError(
      403,
      "CSRF_ORIGIN_MISMATCH",
      "Cross-origin request blocked",
    );
    fail(req, res, err.statusCode, {
      code: err.code,
      message: err.message,
    });
    return;
  }

  next();
}
