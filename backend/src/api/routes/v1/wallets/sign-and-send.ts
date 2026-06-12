import { Router } from "express";
import { ZodError } from "zod";
import { requireAuth } from "../../../middleware/auth.js";
import { signAndSendForUser } from "../../../../services/wallet/sign-and-send.service.js";
import { signAndSendBodySchema } from "../../../../services/wallet/wallet.types.js";
import { fail, ok } from "../../../../utils/http-response.js";

export const walletSignAndSendRouter = Router();

walletSignAndSendRouter.post(
  "/api/v1/wallets/sign-and-send",
  requireAuth,
  async (req, res, next) => {
    try {
      const body = signAndSendBodySchema.parse(req.body);
      const result = await signAndSendForUser(req.user.privyUserId, body);
      return ok(req, res, result, 201);
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
