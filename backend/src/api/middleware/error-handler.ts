import type { NextFunction, Request, Response } from "express";
import { AppError } from "../../errors/app-error.js";
import { getServerEnv } from "../../config/env.js";
import { logger } from "../../shared/logger.js";
import { fail } from "../../utils/http-response.js";

export function errorHandlerMiddleware(
  err: unknown,
  req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (res.headersSent) {
    return;
  }

  if (err instanceof AppError) {
    fail(req, res, err.statusCode, {
      code: err.code,
      message: err.message,
      details: err.details,
    });
    return;
  }

  const message = err instanceof Error ? err.message : "Internal server error";
  const stack = err instanceof Error ? err.stack : undefined;

  logger.error("Unhandled request error", {
    correlationId: req.correlationId,
    method: req.method,
    path: req.originalUrl,
    message,
    stack,
  });

  const { nodeEnv } = getServerEnv();
  fail(req, res, 500, {
    code: "INTERNAL_SERVER_ERROR",
    message: nodeEnv === "production" ? "Internal server error" : message,
  });
}
