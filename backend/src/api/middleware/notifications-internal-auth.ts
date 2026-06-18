import type { NextFunction, Request, Response } from "express";
import { getNotificationsConfig } from "../../config/notifications.js";
import { AppError } from "../../errors/app-error.js";
import { fail } from "../../utils/http-response.js";

const HEADER_NAME = "x-notifications-internal-key";

export function requireNotificationsInternalAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const config = getNotificationsConfig();
  const expected = config.internalApiKey;

  if (!expected) {
    fail(req, res, 503, {
      code: "NOTIFICATIONS_INTERNAL_DISABLED",
      message: "Internal notification emit is not configured",
    });
    return;
  }

  const provided = req.header(HEADER_NAME);
  if (!provided || provided !== expected) {
    fail(req, res, 401, {
      code: "UNAUTHORIZED",
      message: "Invalid internal notification credentials",
    });
    return;
  }

  next();
}

export function assertNotificationsInternalAuthFromHeader(
  headerValue: string | undefined,
): void {
  const config = getNotificationsConfig();
  const expected = config.internalApiKey;

  if (!expected) {
    throw new AppError(
      503,
      "NOTIFICATIONS_INTERNAL_DISABLED",
      "Internal notification emit is not configured",
    );
  }

  if (!headerValue || headerValue !== expected) {
    throw new AppError(401, "UNAUTHORIZED", "Invalid internal notification credentials");
  }
}
