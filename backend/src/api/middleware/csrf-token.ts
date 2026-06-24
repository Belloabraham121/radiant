import { randomBytes, timingSafeEqual } from "node:crypto";
import type { Response } from "express";
import { getAuthCookieNames } from "../../config/env.js";

export const CSRF_COOKIE_NAME = "radiant-csrf";
export const CSRF_HEADER_NAME = "x-csrf-token";
export const RADIANT_CLIENT_HEADER = "x-radiant-client";

export function issueCsrfCookie(res: Response): string {
  const token = randomBytes(32).toString("hex");
  res.cookie(CSRF_COOKIE_NAME, token, {
    httpOnly: false,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
  });
  return token;
}

export function hasAuthSessionCookie(cookies: Record<string, unknown> | undefined): boolean {
  if (!cookies) {
    return false;
  }
  const names = getAuthCookieNames();
  return Boolean(cookies[names.accessToken] || cookies[names.session]);
}

export function hasValidCsrfToken(
  cookies: Record<string, unknown> | undefined,
  headerValue: string | undefined,
): boolean {
  if (!headerValue) {
    return false;
  }
  const cookieValue = cookies?.[CSRF_COOKIE_NAME];
  if (typeof cookieValue !== "string" || cookieValue.length === 0) {
    return false;
  }
  const headerBuf = Buffer.from(headerValue);
  const cookieBuf = Buffer.from(cookieValue);
  if (headerBuf.length !== cookieBuf.length) {
    return false;
  }
  return timingSafeEqual(headerBuf, cookieBuf);
}
