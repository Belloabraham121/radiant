import { Router } from "express";
import { requireAuth } from "../../../middleware/auth.js";
import { getDeepBookManagerUiData } from "../../../../services/defi/deepbook/deepbook-balance-manager.service.js";
import { ok } from "../../../../utils/http-response.js";

export const defiBalanceManagerRouter = Router();

defiBalanceManagerRouter.get(
  "/api/v1/defi/balance-manager",
  requireAuth,
  async (req, res, next) => {
    try {
      const data = await getDeepBookManagerUiData(req.user.privyUserId);
      return ok(req, res, data);
    } catch (err) {
      next(err);
    }
  },
);
