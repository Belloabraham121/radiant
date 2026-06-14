import { Router } from "express";
import { AppError } from "../../../../errors/app-error.js";
import { requireAuth } from "../../../middleware/auth.js";
import {
  getInstallationArtifactPayload,
  listInstallationsForUser,
} from "../../../../services/apps/app-installation.service.js";
import {
  flashLoanQuoteForInstallation,
  governanceStateForInstallation,
  openOrdersForInstallation,
  poolInfoForInstallation,
  stakeBalanceForInstallation,
  swapQuoteForInstallation,
} from "../../../../services/projects/installation-platform.service.js";
import { listAppActionsCatalogForProject } from "../../../../services/projects/app-action-catalog.service.js";
import { findInstallationForUser } from "../../../../services/apps/app-installation.repository.js";
import { findUserByPrivyId } from "../../../../services/auth/user.repository.js";
import { parseAppActionName } from "../../../../services/projects/app-action-mapper.js";
import { executeAppActionForInstallation } from "../../../../services/projects/app-action.service.js";
import { readAppActionSessionId } from "../../../../utils/app-action-request-context.js";
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

installationsRouter.post(
  "/api/v1/installations/:installationId/deepbook/flash-loan/quote",
  requireAuth,
  async (req, res, next) => {
    try {
      const data = await flashLoanQuoteForInstallation(
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
  "/api/v1/installations/:installationId/deepbook/open-orders",
  requireAuth,
  async (req, res, next) => {
    try {
      const data = await openOrdersForInstallation(
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
  "/api/v1/installations/:installationId/deepbook/stake-balance",
  requireAuth,
  async (req, res, next) => {
    try {
      const data = await stakeBalanceForInstallation(
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
  "/api/v1/installations/:installationId/deepbook/governance-state",
  requireAuth,
  async (req, res, next) => {
    try {
      const data = await governanceStateForInstallation(
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
      const user = await findUserByPrivyId(req.user.privyUserId);
      if (!user) {
        throw new AppError(404, "USER_NOT_FOUND", "User not found");
      }

      const installation = await findInstallationForUser(req.params.installationId, user.id);
      if (!installation) {
        throw new AppError(404, "INSTALLATION_NOT_FOUND", "Installation not found");
      }

      return ok(req, res, listAppActionsCatalogForProject(installation.source_project));
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
      const sessionId = readAppActionSessionId(req);
      const result = await executeAppActionForInstallation(
        req.user.privyUserId,
        req.params.installationId,
        action,
        req.body,
        { source: "ui", ...(sessionId ? { sessionId } : {}) },
      );
      return ok(req, res, result);
    } catch (err) {
      next(err);
    }
  },
);
