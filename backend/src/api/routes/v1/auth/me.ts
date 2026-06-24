import { Router } from "express";
import { getDefaultAgentChainId } from "../../../../config/chains.js";
import { requireAuth } from "../../../middleware/auth.js";
import { authMeRateLimitMiddleware } from "../../../middleware/auth-rate-limit.js";
import { fetchPrivyUser } from "../../../../services/auth/privy-auth.service.js";
import { getOrCreateUser, toAuthMeData } from "../../../../services/auth/user.service.js";
import type { ChainId } from "../../../../services/chains/types.js";
import { isWalletFunded } from "../../../../services/wallet/agent-wallet.service.js";
import { ok } from "../../../../utils/http-response.js";
import { issueCsrfCookie } from "../../../middleware/csrf-token.js";

export const authMeRouter = Router();

authMeRouter.get(
  "/api/v1/auth/me",
  requireAuth,
  authMeRateLimitMiddleware,
  async (req, res, next) => {
  try {
    const privyUser = await fetchPrivyUser(req.user.privyUserId, req);
    const user = await getOrCreateUser(req.user.privyUserId, privyUser);

    const fundedByChain = new Map<ChainId, boolean>();
    await Promise.all(
      user.agent_wallets.map(async (wallet) => {
        const chainType = wallet.chain_type as ChainId;
        const funded = await isWalletFunded(wallet.address, chainType, {
          privyWalletId: wallet.privy_wallet_id,
        });
        fundedByChain.set(chainType, funded);
      }),
    );

    if (user.agent_wallets.length === 0) {
      fundedByChain.set(getDefaultAgentChainId(), false);
    }

    issueCsrfCookie(res);

    return ok(req, res, toAuthMeData(user, privyUser, fundedByChain));
  } catch (err) {
    next(err);
  }
  },
);
