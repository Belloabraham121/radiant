import { Router } from "express";
import { getDefaultAgentChainId } from "../../../../config/chains.js";
import { requireAuth } from "../../../middleware/auth.js";
import { getWalletBalancesForPrivyUser } from "../../../../services/wallet/agent-wallet.service.js";
import { walletBalancesQuerySchema } from "../../../../services/wallet/wallet.types.js";
import { ok } from "../../../../utils/http-response.js";

export const walletBalancesRouter = Router();

walletBalancesRouter.get("/api/v1/wallets/balances", requireAuth, async (req, res, next) => {
  try {
    const query = walletBalancesQuerySchema.parse({
      chain:
        typeof req.query.chain === "string" ? req.query.chain : undefined,
    });

    const chainId = query.chain ?? getDefaultAgentChainId();
    const balances = await getWalletBalancesForPrivyUser(req.user.privyUserId, chainId);
    return ok(req, res, balances);
  } catch (err) {
    next(err);
  }
});
