import { Router } from "express";
import { requireAuth } from "../../../middleware/auth.js";
import { findUserByPrivyId } from "../../../../services/auth/user.repository.js";
import { listProjectsByUserId, findProjectByIdForUser } from "../../../../services/projects/project.repository.js";
import { listArtifactFiles } from "../../../../services/projects/artifact.repository.js";
import { AppError } from "../../../../errors/app-error.js";
import { ok } from "../../../../utils/http-response.js";

export const projectsRouter = Router();

projectsRouter.get("/api/v1/projects", requireAuth, async (req, res, next) => {
  try {
    const user = await findUserByPrivyId(req.user.privyUserId);
    if (!user) {
      throw new AppError(404, "USER_NOT_FOUND", "User not found");
    }

    const projects = await listProjectsByUserId(user.id);
    return ok(req, res, {
      projects: projects.map((project) => ({
        id: project.id,
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

projectsRouter.get("/api/v1/projects/:projectId", requireAuth, async (req, res, next) => {
  try {
    const user = await findUserByPrivyId(req.user.privyUserId);
    if (!user) {
      throw new AppError(404, "USER_NOT_FOUND", "User not found");
    }

    const project = await findProjectByIdForUser(req.params.projectId, user.id);
    if (!project) {
      throw new AppError(404, "PROJECT_NOT_FOUND", "Project not found");
    }

    const files = await listArtifactFiles(project.id, project.artifact_revision);

    return ok(req, res, {
      project: {
        id: project.id,
        name: project.name,
        tagline: project.tagline,
        template: project.template,
        status: project.status,
        accent: project.accent,
        template_params: project.template_params,
        walrus_url: project.walrus_url,
        artifact_revision: project.artifact_revision,
        updated_at: project.updated_at.toISOString(),
        created_at: project.created_at.toISOString(),
        files: files.map((file) => ({
          path: file.path.replace(/^\/workspace\//, ""),
          content: file.content,
        })),
      },
    });
  } catch (err) {
    next(err);
  }
});
