import type { NextFunction, Request, Response } from "express";
import { getInngestNetworkEnv } from "../../config/inngest.js";
import { AppError } from "../../errors/app-error.js";
import { fail } from "../../utils/http-response.js";

function normalizeIp(ip: string): string {
  if (ip.startsWith("::ffff:")) {
    return ip.slice("::ffff:".length);
  }
  return ip;
}

function clientIp(req: Request): string {
  return normalizeIp(req.ip ?? "unknown");
}

function isIpAllowed(ip: string, allowlist: string[]): boolean {
  if (allowlist.length === 0) {
    return false;
  }
  return allowlist.some((entry) => entry === ip || entry === "*");
}

/** Restricts /api/inngest to configured IP allowlist (production requires explicit list). */
export function inngestNetworkGuardMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (process.env.NODE_ENV === "test") {
    next();
    return;
  }

  const { allowedIps, requireAllowlist } = getInngestNetworkEnv();
  if (!requireAllowlist) {
    next();
    return;
  }

  const ip = clientIp(req);
  if (isIpAllowed(ip, allowedIps)) {
    next();
    return;
  }

  const err = new AppError(
    403,
    "INNGEST_NETWORK_FORBIDDEN",
    "Inngest endpoint is not reachable from this network.",
  );
  fail(req, res, err.statusCode, {
    code: err.code,
    message: err.message,
  });
}
