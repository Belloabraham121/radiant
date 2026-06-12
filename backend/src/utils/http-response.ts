import type { Request, Response } from "express";

type ApiErrorBody = {
  code: string;
  message: string;
  details?: unknown;
};

export function ok<T>(req: Request, res: Response, data: T, status = 200): Response {
  return res.status(status).json({
    success: true,
    data,
    meta: {
      correlation_id: req.correlationId,
      timestamp: new Date().toISOString(),
    },
    error: null,
  });
}

export function fail(
  req: Request,
  res: Response,
  status: number,
  error: ApiErrorBody,
): Response {
  return res.status(status).json({
    success: false,
    data: null,
    meta: {
      correlation_id: req.correlationId,
      timestamp: new Date().toISOString(),
    },
    error,
  });
}
