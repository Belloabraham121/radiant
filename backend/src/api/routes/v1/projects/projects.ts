import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../../../middleware/auth.js";
import { findUserByPrivyId } from "../../../../services/auth/user.repository.js";
import {
  listProjectsForUserPaginated,
  deleteProjectForUser,
  findProjectByIdForUser,
  listProjectsBySessionForUser,
} from "../../../../services/projects/project.repository.js";
import {
  getProjectArtifactPayloadForUser,
  listProjectRevisionsForUser,
  restoreProjectRevisionForUser,
} from "../../../../services/projects/project-artifact.service.js";
import {
  flashLoanQuoteForProject,
  governanceStateForProject,
  marginManagerInfoForProject,
  marginOpenOrdersForProject,
  marginPoolInfoForProject,
  marginRiskRatioForProject,
  openOrdersForProject,
  poolInfoForProject,
  stakeBalanceForProject,
  swapQuoteForProject,
} from "../../../../services/projects/project-platform.service.js";
import {
  getProjectPublishStateForUser,
  publishProjectForUser,
} from "../../../../services/apps/app-installation.service.js";
import { listAppActionsCatalogForProject } from "../../../../services/projects/app-action-catalog.service.js";
import { parseAppActionName } from "../../../../services/projects/app-action-mapper.js";
import { executeAppActionForProject } from "../../../../services/projects/app-action.service.js";
import { readAppActionSessionId } from "../../../../utils/app-action-request-context.js";
import { AppError } from "../../../../errors/app-error.js";
import { ok } from "../../../../utils/http-response.js";

const listProjectsQuerySchema = z.object({
  session_id: z.string().uuid().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(12),
  search: z.string().trim().optional(),
  scope: z.enum(["all", "saved", "deployed"]).default("all"),
});

const getProjectQuerySchema = z.object({
  revision: z.coerce.number().int().min(0).optional(),
});

const restoreRevisionBodySchema = z.object({
  revision: z.number().int().min(0),
});

export const projectsRouter = Router();

projectsRouter.get("/api/v1/projects", requireAuth, async (req, res, next) => {
  try {
    const query = listProjectsQuerySchema.parse(req.query);
    const user = await findUserByPrivyId(req.user.privyUserId);
    if (!user) {
      throw new AppError(404, "USER_NOT_FOUND", "User not found");
    }

    if (query.session_id) {
      const sessionProjects = await listProjectsBySessionForUser(user.id, query.session_id);
      return ok(req, res, {
        projects: sessionProjects.map((project) => ({
          id: project.id,
          session_id: project.session_id,
          name: project.name,
          tagline: project.tagline,
          template: project.template,
          status: project.status,
          accent: project.accent,
          walrus_url: project.walrus_url,
          artifact_revision: project.artifact_revision,
          updated_at: project.updated_at.toISOString(),
          created_at: project.created_at.toISOString(),
        })),
      });
    }

    const { projects: paginatedProjects, total } = await listProjectsForUserPaginated(user.id, {
      page: query.page,
      limit: query.limit,
      search: query.search,
      scope: query.scope,
    });

    return ok(req, res, {
      projects: paginatedProjects.map((project) => ({
        id: project.id,
        session_id: project.session_id,
        name: project.name,
        tagline: project.tagline,
        template: project.template,
        status: project.status,
        accent: project.accent,
        walrus_url: project.walrus_url,
        artifact_revision: project.artifact_revision,
        updated_at: project.updated_at.toISOString(),
        created_at: project.created_at.toISOString(),
      })),
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        total_pages: Math.max(1, Math.ceil(total / query.limit)),
      },
    });
  } catch (err) {
    next(err);
  }
});

projectsRouter.get("/api/v1/projects/:projectId/revisions", requireAuth, async (req, res, next) => {
  try {
    const data = await listProjectRevisionsForUser(req.user.privyUserId, req.params.projectId);
    return ok(req, res, data);
  } catch (err) {
    next(err);
  }
});

projectsRouter.post("/api/v1/projects/:projectId/restore", requireAuth, async (req, res, next) => {
  try {
    const body = restoreRevisionBodySchema.parse(req.body);
    const artifact = await restoreProjectRevisionForUser(
      req.user.privyUserId,
      req.params.projectId,
      body.revision,
    );
    return ok(req, res, { artifact });
  } catch (err) {
    next(err);
  }
});

projectsRouter.get("/api/v1/projects/:projectId/meta", requireAuth, async (req, res, next) => {
  try {
    const user = await findUserByPrivyId(req.user.privyUserId);
    if (!user) {
      throw new AppError(404, "USER_NOT_FOUND", "User not found");
    }

    const project = await findProjectByIdForUser(req.params.projectId, user.id);
    if (!project) {
      throw new AppError(404, "PROJECT_NOT_FOUND", "Project not found");
    }

    return ok(req, res, {
      id: project.id,
      name: project.name,
      status: project.status,
      walrus_url: project.walrus_url,
      artifact_revision: project.artifact_revision,
      updated_at: project.updated_at.toISOString(),
    });
  } catch (err) {
    next(err);
  }
});

projectsRouter.get("/api/v1/projects/:projectId", requireAuth, async (req, res, next) => {
  try {
    const query = getProjectQuerySchema.parse(req.query);
    const user = await findUserByPrivyId(req.user.privyUserId);
    if (!user) {
      throw new AppError(404, "USER_NOT_FOUND", "User not found");
    }

    const project = await findProjectByIdForUser(req.params.projectId, user.id);
    if (!project) {
      throw new AppError(404, "PROJECT_NOT_FOUND", "Project not found");
    }

    const revision = query.revision ?? project.artifact_revision;
    const artifact = await getProjectArtifactPayloadForUser(
      req.user.privyUserId,
      project.id,
      revision,
    );

    return ok(req, res, {
      project: {
        id: project.id,
        session_id: project.session_id,
        name: project.name,
        tagline: project.tagline,
        template: project.template,
        status: project.status,
        accent: project.accent,
        template_params: project.template_params,
        walrus_url: project.walrus_url,
        artifact_revision: project.artifact_revision,
        viewed_revision: revision,
        updated_at: project.updated_at.toISOString(),
        created_at: project.created_at.toISOString(),
        files: artifact.files,
        artifact,
      },
    });
  } catch (err) {
    next(err);
  }
});

projectsRouter.post(
  "/api/v1/projects/:projectId/swap/quote",
  requireAuth,
  async (req, res, next) => {
    try {
      const data = await swapQuoteForProject(
        req.user.privyUserId,
        req.params.projectId,
        req.body,
      );
      return ok(req, res, data);
    } catch (err) {
      next(err);
    }
  },
);

projectsRouter.get(
  "/api/v1/projects/:projectId/deepbook/pool-info",
  requireAuth,
  async (req, res, next) => {
    try {
      const data = await poolInfoForProject(
        req.user.privyUserId,
        req.params.projectId,
        req.query,
      );
      return ok(req, res, data);
    } catch (err) {
      next(err);
    }
  },
);

projectsRouter.post(
  "/api/v1/projects/:projectId/deepbook/flash-loan/quote",
  requireAuth,
  async (req, res, next) => {
    try {
      const data = await flashLoanQuoteForProject(
        req.user.privyUserId,
        req.params.projectId,
        req.body,
      );
      return ok(req, res, data);
    } catch (err) {
      next(err);
    }
  },
);

projectsRouter.get(
  "/api/v1/projects/:projectId/deepbook/open-orders",
  requireAuth,
  async (req, res, next) => {
    try {
      const data = await openOrdersForProject(
        req.user.privyUserId,
        req.params.projectId,
        req.query,
      );
      return ok(req, res, data);
    } catch (err) {
      next(err);
    }
  },
);

projectsRouter.get(
  "/api/v1/projects/:projectId/deepbook/stake-balance",
  requireAuth,
  async (req, res, next) => {
    try {
      const data = await stakeBalanceForProject(
        req.user.privyUserId,
        req.params.projectId,
        req.query,
      );
      return ok(req, res, data);
    } catch (err) {
      next(err);
    }
  },
);

projectsRouter.get(
  "/api/v1/projects/:projectId/deepbook/governance-state",
  requireAuth,
  async (req, res, next) => {
    try {
      const data = await governanceStateForProject(
        req.user.privyUserId,
        req.params.projectId,
        req.query,
      );
      return ok(req, res, data);
    } catch (err) {
      next(err);
    }
  },
);

projectsRouter.get(
  "/api/v1/projects/:projectId/deepbook/margin-manager-info",
  requireAuth,
  async (req, res, next) => {
    try {
      const data = await marginManagerInfoForProject(
        req.user.privyUserId,
        req.params.projectId,
        req.query,
      );
      return ok(req, res, data);
    } catch (err) {
      next(err);
    }
  },
);

projectsRouter.get(
  "/api/v1/projects/:projectId/deepbook/margin-pool-info",
  requireAuth,
  async (req, res, next) => {
    try {
      const data = await marginPoolInfoForProject(
        req.user.privyUserId,
        req.params.projectId,
        req.query,
      );
      return ok(req, res, data);
    } catch (err) {
      next(err);
    }
  },
);

projectsRouter.get(
  "/api/v1/projects/:projectId/deepbook/margin-risk-ratio",
  requireAuth,
  async (req, res, next) => {
    try {
      const data = await marginRiskRatioForProject(
        req.user.privyUserId,
        req.params.projectId,
        req.query,
      );
      return ok(req, res, data);
    } catch (err) {
      next(err);
    }
  },
);

projectsRouter.get(
  "/api/v1/projects/:projectId/deepbook/margin-open-orders",
  requireAuth,
  async (req, res, next) => {
    try {
      const data = await marginOpenOrdersForProject(
        req.user.privyUserId,
        req.params.projectId,
        req.query,
      );
      return ok(req, res, data);
    } catch (err) {
      next(err);
    }
  },
);

projectsRouter.get("/api/v1/projects/:projectId/actions", requireAuth, async (req, res, next) => {
  try {
    const user = await findUserByPrivyId(req.user.privyUserId);
    if (!user) {
      throw new AppError(404, "USER_NOT_FOUND", "User not found");
    }

    const project = await findProjectByIdForUser(req.params.projectId, user.id);
    if (!project) {
      throw new AppError(404, "PROJECT_NOT_FOUND", "Project not found");
    }

    return ok(req, res, listAppActionsCatalogForProject(project));
  } catch (err) {
    next(err);
  }
});

projectsRouter.post(
  "/api/v1/projects/:projectId/actions/:actionName",
  requireAuth,
  async (req, res, next) => {
    try {
      const action = parseAppActionName(req.params.actionName);
      const sessionId = readAppActionSessionId(req);
      const result = await executeAppActionForProject(
        req.user.privyUserId,
        req.params.projectId,
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

projectsRouter.get("/api/v1/projects/:projectId/publish", requireAuth, async (req, res, next) => {
  try {
    const data = await getProjectPublishStateForUser(req.user.privyUserId, req.params.projectId);
    return ok(req, res, data);
  } catch (err) {
    next(err);
  }
});

projectsRouter.post("/api/v1/projects/:projectId/publish", requireAuth, async (req, res, next) => {
  try {
    const data = await publishProjectForUser(
      req.user.privyUserId,
      req.params.projectId,
      req.body,
    );
    return ok(req, res, data);
  } catch (err) {
    next(err);
  }
});

projectsRouter.delete("/api/v1/projects/:projectId", requireAuth, async (req, res, next) => {
  try {
    const user = await findUserByPrivyId(req.user.privyUserId);
    if (!user) {
      throw new AppError(404, "USER_NOT_FOUND", "User not found");
    }

    const project = await findProjectByIdForUser(req.params.projectId, user.id);
    if (!project) {
      throw new AppError(404, "PROJECT_NOT_FOUND", "Project not found");
    }

    await deleteProjectForUser(project.id, user.id);
    return ok(req, res, { deleted: true, project_id: project.id });
  } catch (err) {
    next(err);
  }
});
