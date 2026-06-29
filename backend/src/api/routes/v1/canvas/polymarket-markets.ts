import { Router } from "express";
import { z } from "zod";
import { AppError } from "../../../../errors/app-error.js";
import { tryConsumeTokenBucket } from "../../../../infrastructure/rate-limit/token-bucket.js";
import { requireAuth } from "../../../middleware/auth.js";
import { requireFeature } from "../../../middleware/require-feature.js";
import {
  getPolymarketMarketById,
  searchPolymarketMarkets,
} from "../../../../services/canvas/adapters/polymarket/polymarket-market-discovery.service.js";
import {
  POLYMARKET_DISCOVERY_CATEGORIES,
} from "../../../../services/canvas/adapters/polymarket/polymarket-gamma.types.js";
import { ok } from "../../../../utils/http-response.js";

export const canvasPolymarketMarketsRouter = Router();

const canvasGuard = [requireAuth, requireFeature("canvas")];

const marketSearchQuerySchema = z.object({
  q: z.string().trim().optional(),
  category: z.enum(Object.keys(POLYMARKET_DISCOVERY_CATEGORIES) as [string, ...string[]]).optional(),
  tag: z
    .string()
    .trim()
    .regex(/^[a-z0-9-]+$/, "Tag must be a lowercase slug.")
    .optional(),
  limit: z.coerce.number().int().min(1).max(50).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});

const DISCOVERY_RATE_LIMIT = {
  capacity: 30,
  refillIntervalMs: 10_000,
};

canvasPolymarketMarketsRouter.get(
  "/api/v1/canvas/polymarket/markets",
  ...canvasGuard,
  async (req, res, next) => {
    try {
      const allowed = await tryConsumeTokenBucket(
        `canvas-pm-discovery:${req.user.privyUserId}`,
        DISCOVERY_RATE_LIMIT,
      );
      if (!allowed) {
        throw new AppError(
          429,
          "RATE_LIMITED",
          "Too many Polymarket search requests. Try again shortly.",
        );
      }

      const query = marketSearchQuerySchema.parse({
        q: typeof req.query.q === "string" ? req.query.q : undefined,
        category: typeof req.query.category === "string" ? req.query.category : undefined,
        tag: typeof req.query.tag === "string" ? req.query.tag : undefined,
        limit: typeof req.query.limit === "string" ? req.query.limit : undefined,
        offset: typeof req.query.offset === "string" ? req.query.offset : undefined,
      });

      const data = await searchPolymarketMarkets({
        q: query.q,
        category: query.category as keyof typeof POLYMARKET_DISCOVERY_CATEGORIES | undefined,
        tag: query.tag,
        limit: query.limit,
        offset: query.offset,
      });

      return ok(req, res, data);
    } catch (err) {
      next(err);
    }
  },
);

canvasPolymarketMarketsRouter.get(
  "/api/v1/canvas/polymarket/markets/:id",
  ...canvasGuard,
  async (req, res, next) => {
    try {
      const allowed = await tryConsumeTokenBucket(
        `canvas-pm-discovery:${req.user.privyUserId}`,
        DISCOVERY_RATE_LIMIT,
      );
      if (!allowed) {
        throw new AppError(
          429,
          "RATE_LIMITED",
          "Too many Polymarket search requests. Try again shortly.",
        );
      }

      const market = await getPolymarketMarketById(req.params.id);
      if (!market) {
        throw new AppError(404, "MARKET_NOT_FOUND", "Polymarket market not found.");
      }

      return ok(req, res, { market });
    } catch (err) {
      next(err);
    }
  },
);
