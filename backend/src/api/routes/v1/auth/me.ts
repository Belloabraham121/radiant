import { Router } from "express";
import { requireAuth } from "../../../middleware/auth.js";
import { fetchPrivyUser } from "../../../../services/auth/privy-auth.service.js";
import { getOrCreateUser, toAuthMeData } from "../../../../services/auth/user.service.js";
import { ok } from "../../../../utils/http-response.js";

export const authMeRouter = Router();

authMeRouter.get("/api/v1/auth/me", requireAuth, async (req, res, next) => {
  try {
    const privyUser = await fetchPrivyUser(req.user.privyUserId, req);
    const user = await getOrCreateUser(req.user.privyUserId, privyUser);
    return ok(req, res, toAuthMeData(user, privyUser));
  } catch (err) {
    next(err);
  }
});
