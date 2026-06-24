import { Router } from "express";
import { requireAuth } from "../../../middleware/auth.js";
import { authExportRateLimitMiddleware } from "../../../middleware/auth-rate-limit.js";
import { exportUserDataForPrivyUser } from "../../../../services/auth/user-data-export.service.js";
import { ok } from "../../../../utils/http-response.js";

export const authExportRouter = Router();

authExportRouter.get(
  "/api/v1/auth/export",
  requireAuth,
  authExportRateLimitMiddleware,
  async (req, res, next) => {
  try {
    const data = await exportUserDataForPrivyUser(req.user.privyUserId);
    return ok(req, res, data);
  } catch (err) {
    return next(err);
  }
  },
);
