import { Router } from "express";
import { requireAuth } from "../../../middleware/auth.js";
import { fetchPrivyUser } from "../../../../services/auth/privy-auth.service.js";
import { getOrCreateUser, toAuthMeData } from "../../../../services/auth/user.service.js";
import { isWalletFunded } from "../../../../services/wallet/agent-wallet.service.js";
import { ok } from "../../../../utils/http-response.js";

export const authMeRouter = Router();

authMeRouter.get("/api/v1/auth/me", requireAuth, async (req, res, next) => {
  try {
    const privyUser = await fetchPrivyUser(req.user.privyUserId, req);
    const user = await getOrCreateUser(req.user.privyUserId, privyUser);
    const funded = user.agent_wallet
      ? await isWalletFunded(user.agent_wallet.sui_address)
      : false;
    return ok(req, res, toAuthMeData(user, privyUser, funded));
  } catch (err) {
    next(err);
  }
});
