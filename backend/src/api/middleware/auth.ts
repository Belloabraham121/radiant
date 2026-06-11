import type { NextFunction, Request, Response } from "express";
import { AppError } from "../../errors/app-error.js";
import { authenticateFromRequest } from "../../services/auth/privy-auth.service.js";
import { fail } from "../../utils/http-response.js";

export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const session = await authenticateFromRequest(req);
    req.user = {
      privyUserId: session.privyUserId,
      sessionId: session.sessionId,
    };
    next();
  } catch (err) {
    if (err instanceof AppError) {
      fail(req, res, err.statusCode, {
        code: err.code,
        message: err.message,
        details: err.details,
      });
      return;
    }
    next(err);
  }
}
