import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../../../middleware/auth.js";
import { findUserByPrivyId } from "../../../../services/auth/user.repository.js";
import {
  listProjectsByUserId,
  findProjectByIdForUser,
  listProjectsBySessionForUser,
} from "../../../../services/projects/project.repository.js";
import {
  getProjectArtifactPayloadForUser,
  listProjectRevisionsForUser,
  restoreProjectRevisionForUser,
} from "../../../../services/projects/project-artifact.service.js";
import {
  poolInfoForProject,
  swapQuoteForProject,
} from "../../../../services/projects/project-platform.service.js";
import { AppError } from "../../../../errors/app-error.js";
import { ok } from "../../../../utils/http-response.js";

const listProjectsQuerySchema = z.object({
  session_id: z.string().uuid().optional(),
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

    const projects = query.session_id
      ? await listProjectsBySessionForUser(user.id, query.session_id)
      : await listProjectsByUserId(user.id);

    return ok(req, res, {
      projects: projects.map((project) => ({
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
