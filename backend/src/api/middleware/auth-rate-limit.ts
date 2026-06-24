import type { NextFunction, Request, Response } from "express";
import { tryConsumeTokenBucket } from "../../infrastructure/rate-limit/token-bucket.js";
import { AppError } from "../../errors/app-error.js";
import { fail } from "../../utils/http-response.js";

type RateLimitConfig = {
  prefix: string;
  capacity: number;
  refillIntervalMs: number;
};

const AUTH_ME_LIMIT: RateLimitConfig = {
  prefix: "auth-me",
  capacity: 60,
  refillIntervalMs: 60_000,
};

const REGISTER_WALLET_LIMIT: RateLimitConfig = {
  prefix: "auth-register-wallet",
  capacity: 20,
  refillIntervalMs: 60_000,
};

const AUTH_EXPORT_LIMIT: RateLimitConfig = {
  prefix: "auth-export",
  capacity: 5,
  refillIntervalMs: 60_000,
};

const CHAT_LIMIT: RateLimitConfig = {
  prefix: "agent-chat",
  capacity: 20,
  refillIntervalMs: 60_000,
};

const PROXY_LIMIT: RateLimitConfig = {
  prefix: "agent-proxy",
  capacity: 30,
  refillIntervalMs: 60_000,
};

function clientIp(req: Request): string {
  return req.ip ?? "unknown";
}

async function enforceRateLimit(
  req: Request,
  res: Response,
  config: RateLimitConfig,
  keySuffix: string,
): Promise<boolean> {
  const allowed = await tryConsumeTokenBucket(
    `${config.prefix}:${clientIp(req)}:${keySuffix}`,
    {
      capacity: config.capacity,
      refillIntervalMs: config.refillIntervalMs,
    },
  );

  if (!allowed) {
    const err = new AppError(
      429,
      "RATE_LIMITED",
      "Too many requests. Try again shortly.",
    );
    fail(req, res, err.statusCode, {
      code: err.code,
      message: err.message,
    });
    return false;
  }

  return true;
}

export async function authMeRateLimitMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const suffix = req.user?.privyUserId ?? "anonymous";
  if (!(await enforceRateLimit(req, res, AUTH_ME_LIMIT, suffix))) {
    return;
  }
  next();
}

export async function registerWalletRateLimitMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const suffix = req.user?.privyUserId ?? "anonymous";
  if (!(await enforceRateLimit(req, res, REGISTER_WALLET_LIMIT, suffix))) {
    return;
  }
  next();
}

export async function authExportRateLimitMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const suffix = req.user?.privyUserId ?? "anonymous";
  if (!(await enforceRateLimit(req, res, AUTH_EXPORT_LIMIT, suffix))) {
    return;
  }
  next();
}

export async function chatRateLimitMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const suffix = req.user?.privyUserId ?? "anonymous";
  if (!(await enforceRateLimit(req, res, CHAT_LIMIT, suffix))) {
    return;
  }
  next();
}

export async function proxyRateLimitMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const suffix = req.user?.privyUserId ?? "anonymous";
  if (!(await enforceRateLimit(req, res, PROXY_LIMIT, suffix))) {
    return;
  }
  next();
}
