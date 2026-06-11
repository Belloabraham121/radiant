import { Router } from "express";
import { requireAuth } from "../../../middleware/auth.js";
import { getWalletBalancesForPrivyUser } from "../../../../services/wallet/agent-wallet.service.js";
import { ok } from "../../../../utils/http-response.js";

export const walletBalancesRouter = Router();

walletBalancesRouter.get("/api/v1/wallets/balances", requireAuth, async (req, res, next) => {
  try {
    const balances = await getWalletBalancesForPrivyUser(req.user.privyUserId);
    return ok(req, res, balances);
  } catch (err) {
    next(err);
  }
});
