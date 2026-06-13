import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../../../middleware/auth.js";
import {
  getDeepBookOrderbook,
  getDeepBookPoolInfo,
  listDeepBookPools,
} from "../../../../services/defi/deepbook/deepbook-pools.service.js";
import {
  getDeepBookIndexerStatus,
  getDeepBookOhlcv,
} from "../../../../services/defi/deepbook/deepbook-indexer-analytics.service.js";
import { ok } from "../../../../utils/http-response.js";

const orderbookQuerySchema = z.object({
  level: z.coerce.number().int().min(1).max(2).optional(),
  depth: z.coerce.number().int().min(0).optional(),
});

const ohlcvQuerySchema = z.object({
  interval: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(500).optional(),
});

export const defiPoolsRouter = Router();

defiPoolsRouter.get("/api/v1/defi/pools", requireAuth, async (req, res, next) => {
  try {
    const pools = await listDeepBookPools();
    return ok(req, res, pools);
  } catch (err) {
    next(err);
  }
});

defiPoolsRouter.get(
  "/api/v1/defi/pools/:poolName",
  requireAuth,
  async (req, res, next) => {
    try {
      const pool = await getDeepBookPoolInfo(req.params.poolName, req.user.privyUserId);
      return ok(req, res, pool);
    } catch (err) {
      next(err);
    }
  },
);

defiPoolsRouter.get(
  "/api/v1/defi/pools/:poolName/orderbook",
  requireAuth,
  async (req, res, next) => {
    try {
      const query = orderbookQuerySchema.parse({
        level: req.query.level,
        depth: req.query.depth,
      });

      const book = await getDeepBookOrderbook(req.params.poolName, {
        level: query.level as 1 | 2 | undefined,
        depth: query.depth,
      });
      return ok(req, res, book);
    } catch (err) {
      next(err);
    }
  },
);

defiPoolsRouter.get(
  "/api/v1/defi/pools/:poolName/ohlcv",
  requireAuth,
  async (req, res, next) => {
    try {
      const query = ohlcvQuerySchema.parse({
        interval: req.query.interval,
        limit: req.query.limit,
      });

      const ohlcv = await getDeepBookOhlcv({
        pool_key: req.params.poolName,
        interval: query.interval,
        limit: query.limit,
      });
      return ok(req, res, ohlcv);
    } catch (err) {
      next(err);
    }
  },
);

defiPoolsRouter.get("/api/v1/defi/indexer/status", requireAuth, async (req, res, next) => {
  try {
    const status = await getDeepBookIndexerStatus();
    return ok(req, res, status);
  } catch (err) {
    next(err);
  }
});
