import { randomUUID } from "node:crypto";
import type { NextFunction, Request, Response } from "express";

const CORRELATION_HEADER = "x-correlation-id";

export function correlationIdMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const incoming = req.header(CORRELATION_HEADER);
  const correlationId =
    typeof incoming === "string" && incoming.length > 0 ? incoming : randomUUID();

  req.correlationId = correlationId;
  res.setHeader(CORRELATION_HEADER, correlationId);
  next();
}
