import type { NextFunction, Request, Response } from "express";
import { AppError } from "../../errors/app-error.js";
import { logger } from "../../shared/logger.js";

export const EXPORT_CONFIRM_HEADER = "x-export-confirm";

export function requireExportConfirmHeader(
  req: Request,
  _res: Response,
  next: NextFunction,
): void {
  if (req.get(EXPORT_CONFIRM_HEADER) !== "true") {
    next(
      new AppError(
        403,
        "EXPORT_CONFIRM_REQUIRED",
        `Send ${EXPORT_CONFIRM_HEADER}: true to export your data.`,
      ),
    );
    return;
  }
  next();
}

export function auditUserDataExport(
  privyUserId: string,
  correlationId: string,
): void {
  logger.info("user_data_export", {
    privyUserId,
    correlationId,
    timestamp: new Date().toISOString(),
  });
}
