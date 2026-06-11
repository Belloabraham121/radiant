import type { NextFunction, Request, Response } from "express";
import { getServerEnv } from "../../config/env.js";
import { logger } from "../../shared/logger.js";

export function errorHandlerMiddleware(
  err: unknown,
  req: Request,
  res: Response,
  _next: NextFunction,
): void {
  const message = err instanceof Error ? err.message : "Internal server error";
  const stack = err instanceof Error ? err.stack : undefined;

  logger.error("Unhandled request error", {
    correlationId: req.correlationId,
    method: req.method,
    path: req.originalUrl,
    message,
    stack,
  });

  if (res.headersSent) {
    return;
  }

  const { nodeEnv } = getServerEnv();
  res.status(500).json({
    success: false,
    data: null,
    meta: {
      correlation_id: req.correlationId,
      timestamp: new Date().toISOString(),
    },
    error: {
      code: "INTERNAL_SERVER_ERROR",
      message: nodeEnv === "production" ? "Internal server error" : message,
    },
  });
}
