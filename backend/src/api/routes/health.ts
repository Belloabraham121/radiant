import { Router } from "express";
import { getServerEnv } from "../../config/env.js";
import { ok } from "../../utils/http-response.js";

export const healthRouter = Router();

healthRouter.get("/health", (req, res) => {
  return ok(req, res, { status: "ok" });
});

healthRouter.get("/api/v1/version", (req, res) => {
  const { apiDefaultVersion } = getServerEnv();
  return ok(req, res, { version: apiDefaultVersion });
});
