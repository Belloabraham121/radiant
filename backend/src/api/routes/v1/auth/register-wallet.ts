import { Router } from "express";
import { requireAuth } from "../../../middleware/auth.js";
import {
  isWalletFunded,
  registerAgentWallet,
  toAgentWalletSummary,
} from "../../../../services/wallet/agent-wallet.service.js";
import type { ChainId } from "../../../../services/chains/types.js";
import { registerWalletBodySchema } from "../../../../services/wallet/wallet.types.js";
import { fail, ok } from "../../../../utils/http-response.js";
import { ZodError } from "zod";

export const authRegisterWalletRouter = Router();

authRegisterWalletRouter.post(
  "/api/v1/auth/register-wallet",
  requireAuth,
  async (req, res, next) => {
    try {
      const body = registerWalletBodySchema.parse(req.body);
      const wallet = await registerAgentWallet(req.user.privyUserId, body);
      const funded = await isWalletFunded(
        wallet.address,
        wallet.chain_type as ChainId,
      );
      return ok(req, res, toAgentWalletSummary(wallet, funded), 201);
    } catch (err) {
      if (err instanceof ZodError) {
        return fail(req, res, 400, {
          code: "VALIDATION_ERROR",
          message: "Invalid request body",
          details: err.flatten(),
        });
      }
      next(err);
    }
  },
);
