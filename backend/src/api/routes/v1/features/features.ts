import { Router } from "express";
import { getFeatureFlags } from "../../../../config/features.js";
import { ok } from "../../../../utils/http-response.js";

export const featuresRouter = Router();

featuresRouter.get("/api/v1/features", (req, res) => {
  return ok(req, res, { features: getFeatureFlags() });
});
