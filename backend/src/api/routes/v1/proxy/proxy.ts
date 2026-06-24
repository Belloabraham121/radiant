import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../../../middleware/auth.js";
import { proxyRateLimitMiddleware } from "../../../middleware/auth-rate-limit.js";
import { fetchExternal } from "../../../../services/proxy/external-fetch.service.js";
import { ok } from "../../../../utils/http-response.js";
import { AppError } from "../../../../errors/app-error.js";

const proxyRequestSchema = z.object({
  url: z.string().url(),
  method: z.string().optional(),
  headers: z.record(z.string()).optional(),
  body: z.string().optional(),
});

export const proxyRouter = Router();

proxyRouter.post(
  "/api/v1/proxy",
  requireAuth,
  proxyRateLimitMiddleware,
  async (req, res, next) => {
    try {
      const parsed = proxyRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new AppError(
          400,
          "PROXY_INVALID_INPUT",
          `Invalid proxy request: ${parsed.error.issues.map((i) => i.message).join(", ")}`,
        );
      }

      const result = await fetchExternal(parsed.data);
      return ok(req, res, result);
    } catch (err) {
      return next(err);
    }
  },
);
