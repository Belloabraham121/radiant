import { Router } from "express";
import { requireAuth } from "../../../middleware/auth.js";
import {
  getInstallationArtifactPayload,
  listInstallationsForUser,
} from "../../../../services/apps/app-installation.service.js";
import {
  poolInfoForInstallation,
  swapQuoteForInstallation,
} from "../../../../services/projects/installation-platform.service.js";
import { listAppActionsCatalog } from "../../../../services/projects/app-action-catalog.service.js";
import { parseAppActionName } from "../../../../services/projects/app-action-mapper.js";
import { executeAppActionForInstallation } from "../../../../services/projects/app-action.service.js";
import { ok } from "../../../../utils/http-response.js";

export const installationsRouter = Router();

installationsRouter.get("/api/v1/installations", requireAuth, async (req, res, next) => {
  try {
    const data = await listInstallationsForUser(req.user.privyUserId);
    return ok(req, res, data);
  } catch (err) {
    next(err);
  }
});

installationsRouter.get("/api/v1/installations/:installationId", requireAuth, async (req, res, next) => {
  try {
    const data = await getInstallationArtifactPayload(
      req.user.privyUserId,
      req.params.installationId,
    );
    return ok(req, res, data);
  } catch (err) {
    next(err);
  }
});

installationsRouter.post(
  "/api/v1/installations/:installationId/swap/quote",
  requireAuth,
  async (req, res, next) => {
    try {
      const data = await swapQuoteForInstallation(
        req.user.privyUserId,
        req.params.installationId,
        req.body,
      );
      return ok(req, res, data);
    } catch (err) {
      next(err);
    }
  },
);

installationsRouter.get(
  "/api/v1/installations/:installationId/deepbook/pool-info",
  requireAuth,
  async (req, res, next) => {
    try {
      const data = await poolInfoForInstallation(
        req.user.privyUserId,
        req.params.installationId,
        req.query,
      );
      return ok(req, res, data);
    } catch (err) {
      next(err);
    }
  },
);

installationsRouter.get(
  "/api/v1/installations/:installationId/actions",
  requireAuth,
  async (req, res, next) => {
    try {
      await getInstallationArtifactPayload(req.user.privyUserId, req.params.installationId);
      return ok(req, res, listAppActionsCatalog());
    } catch (err) {
      next(err);
    }
  },
);

installationsRouter.post(
  "/api/v1/installations/:installationId/actions/:actionName",
  requireAuth,
  async (req, res, next) => {
    try {
      const action = parseAppActionName(req.params.actionName);
      const result = await executeAppActionForInstallation(
        req.user.privyUserId,
        req.params.installationId,
        action,
        req.body,
        { source: "ui" },
      );
      return ok(req, res, result);
    } catch (err) {
      next(err);
    }
  },
);
