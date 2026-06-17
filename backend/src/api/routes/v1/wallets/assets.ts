import { Router } from "express";
import { AppError } from "../../../../errors/app-error.js";
import { getCoingeckoConfig } from "../../../../config/coingecko.js";
import { tryConsumeTokenBucket } from "../../../../infrastructure/rate-limit/token-bucket.js";
import { requireAuth } from "../../../middleware/auth.js";
import { getWalletAssetsForPrivyUser } from "../../../../services/wallet/wallet-assets.service.js";
import { walletAssetsQuerySchema } from "../../../../services/wallet/wallet.types.js";
import { ok } from "../../../../utils/http-response.js";

export const walletAssetsRouter = Router();

walletAssetsRouter.get("/api/v1/wallets/assets", requireAuth, async (req, res, next) => {
  try {
    const config = getCoingeckoConfig();
    const allowed = await tryConsumeTokenBucket(
      `wallet-assets:${req.user.privyUserId}`,
      {
        capacity: config.walletAssetsRateLimitCapacity,
        refillIntervalMs: config.walletAssetsRateLimitRefillIntervalMs,
      },
    );
    if (!allowed) {
      throw new AppError(
        429,
        "RATE_LIMITED",
        "Too many wallet refresh requests. Try again in a few seconds.",
      );
    }

    const query = walletAssetsQuerySchema.parse({
      chain: typeof req.query.chain === "string" ? req.query.chain : undefined,
      evm_chain_id:
        typeof req.query.evm_chain_id === "string" ? req.query.evm_chain_id : undefined,
      include_zero:
        typeof req.query.include_zero === "string" ? req.query.include_zero : undefined,
      include_usd:
        typeof req.query.include_usd === "string" ? req.query.include_usd : undefined,
    });

    const assets = await getWalletAssetsForPrivyUser(req.user.privyUserId, {
      chain_id: query.chain,
      evm_chain_id: query.evm_chain_id,
      include_zero: query.include_zero,
      include_usd: query.include_usd,
    });

    return ok(req, res, assets);
  } catch (err) {
    next(err);
  }
});
