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
      evm_chain_id:
        typeof req.query.evm_chain_id === "string"
          ? req.query.evm_chain_id
          : undefined,
    });

    const chainId = query.chain ?? getDefaultAgentChainId();
    const balances = await getWalletBalancesForPrivyUser(
      req.user.privyUserId,
      chainId,
      query.evm_chain_id !== undefined
        ? { evm_chain_id: query.evm_chain_id }
        : undefined,
    );
    return ok(req, res, balances);
  } catch (err) {
    next(err);
  }
});
