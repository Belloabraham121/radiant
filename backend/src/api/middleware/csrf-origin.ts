import type { NextFunction, Request, Response } from "express";
import { getCorsEnv } from "../../config/env.js";
import { AppError } from "../../errors/app-error.js";
import { fail } from "../../utils/http-response.js";
import {
  CSRF_HEADER_NAME,
  RADIANT_CLIENT_HEADER,
  hasAuthSessionCookie,
  hasValidCsrfToken,
} from "./csrf-token.js";

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

function isBrowserLikeRequest(req: Request): boolean {
  const secFetchSite = req.get("sec-fetch-site");
  if (secFetchSite) {
    return true;
  }
  const secFetchMode = req.get("sec-fetch-mode");
  if (secFetchMode) {
    return true;
  }
  const accept = req.get("accept") ?? "";
  return accept.includes("text/html");
}

function hasTrustedClientHeader(req: Request): boolean {
  return req.get(RADIANT_CLIENT_HEADER) === "fetch";
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

  const cookieAuthenticated = hasAuthSessionCookie(req.cookies);
  if (!cookieAuthenticated) {
    next();
    return;
  }

  const allowedOrigin = normalizeOrigin(getCorsEnv().corsOrigin);
  const origin = requestOrigin(req);

  if (origin && origin === allowedOrigin) {
    next();
    return;
  }

  if (hasValidCsrfToken(req.cookies, req.get(CSRF_HEADER_NAME))) {
    next();
    return;
  }

  if (hasTrustedClientHeader(req)) {
    next();
    return;
  }

  if (!origin && isBrowserLikeRequest(req)) {
    const err = new AppError(
      403,
      "CSRF_ORIGIN_REQUIRED",
      "Cross-site request blocked — missing Origin.",
    );
    fail(req, res, err.statusCode, {
      code: err.code,
      message: err.message,
    });
    return;
  }

  if (origin && origin !== allowedOrigin) {
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
