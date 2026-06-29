import type { NextFunction, Request, Response } from "express";
import type { FeatureFlagId } from "../../config/features.js";
import { isFeatureEnabled } from "../../config/features.js";
import { AppError } from "../../errors/app-error.js";

export function requireFeature(id: FeatureFlagId) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!isFeatureEnabled(id)) {
      next(new AppError(404, "FEATURE_DISABLED", "This feature is not available."));
      return;
    }
    next();
  };
}
