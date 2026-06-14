import { Router } from "express";
import { getPublicApp, listPublicApps } from "../../../../services/apps/app-catalog.service.js";
import { installPublicAppForUser } from "../../../../services/apps/app-installation.service.js";
import { requireAuth } from "../../../middleware/auth.js";
import { ok } from "../../../../utils/http-response.js";

export const appsRouter = Router();

appsRouter.get("/api/v1/apps", async (req, res, next) => {
  try {
    const data = await listPublicApps(req.query);
    return ok(req, res, data);
  } catch (err) {
    next(err);
  }
});

appsRouter.get("/api/v1/apps/:projectId", async (req, res, next) => {
  try {
    const app = await getPublicApp(req.params.projectId);
    return ok(req, res, { app });
  } catch (err) {
    next(err);
  }
});

appsRouter.post("/api/v1/apps/:projectId/install", requireAuth, async (req, res, next) => {
  try {
    const data = await installPublicAppForUser(req.user.privyUserId, req.params.projectId);
    return ok(req, res, data);
  } catch (err) {
    next(err);
  }
});
