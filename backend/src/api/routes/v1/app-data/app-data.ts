import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../../../middleware/auth.js";
import {
  storeAppDataForUser,
  queryAppDataForUser,
  deleteAppDataForUser,
  storeSharedAppDataForUser,
  querySharedAppDataForUser,
} from "../../../../services/app-data/app-data.service.js";
import { AppError } from "../../../../errors/app-error.js";
import { ok } from "../../../../utils/http-response.js";

const storeBodySchema = z.object({
  collection: z.string().min(1).max(100),
  key: z.string().max(255).nullable().optional(),
  data: z.record(z.unknown()),
});

const queryParamsSchema = z.object({
  key: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
  order: z.enum(["asc", "desc"]).default("desc"),
});

const sharedQueryParamsSchema = z.object({
  since: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
  order: z.enum(["asc", "desc"]).default("asc"),
});

const deleteBodySchema = z.object({
  collection: z.string().min(1).max(100),
  key: z.string().max(255).nullable().optional(),
  id: z.string().uuid().optional(),
});

export const appDataRouter = Router();

// --- Project-scoped routes ---

appDataRouter.post(
  "/api/v1/projects/:projectId/data",
  requireAuth,
  async (req, res, next) => {
    try {
      const parsed = storeBodySchema.safeParse(req.body);
      if (!parsed.success) {
        throw new AppError(400, "INVALID_INPUT", parsed.error.issues.map((i) => i.message).join(", "));
      }
      const result = await storeAppDataForUser(
        req.user.privyUserId,
        { projectId: req.params.projectId },
        parsed.data,
      );
      return ok(req, res, result);
    } catch (err) {
      return next(err);
    }
  },
);

appDataRouter.get(
  "/api/v1/projects/:projectId/data/:collection",
  requireAuth,
  async (req, res, next) => {
    try {
      const params = queryParamsSchema.safeParse(req.query);
      if (!params.success) {
        throw new AppError(400, "INVALID_INPUT", params.error.issues.map((i) => i.message).join(", "));
      }
      const result = await queryAppDataForUser(
        req.user.privyUserId,
        { projectId: req.params.projectId },
        { collection: req.params.collection, ...params.data },
      );
      return ok(req, res, result);
    } catch (err) {
      return next(err);
    }
  },
);

appDataRouter.delete(
  "/api/v1/projects/:projectId/data",
  requireAuth,
  async (req, res, next) => {
    try {
      const parsed = deleteBodySchema.safeParse(req.body);
      if (!parsed.success) {
        throw new AppError(400, "INVALID_INPUT", parsed.error.issues.map((i) => i.message).join(", "));
      }
      const result = await deleteAppDataForUser(
        req.user.privyUserId,
        { projectId: req.params.projectId },
        parsed.data,
      );
      return ok(req, res, result);
    } catch (err) {
      return next(err);
    }
  },
);

// --- Shared project-scoped routes (cross-user reads) ---

appDataRouter.post(
  "/api/v1/projects/:projectId/shared/:collection",
  requireAuth,
  async (req, res, next) => {
    try {
      const parsed = storeBodySchema.safeParse({ ...req.body, collection: req.params.collection });
      if (!parsed.success) {
        throw new AppError(400, "INVALID_INPUT", parsed.error.issues.map((i) => i.message).join(", "));
      }
      const result = await storeSharedAppDataForUser(
        req.user.privyUserId,
        { projectId: req.params.projectId },
        parsed.data,
      );
      return ok(req, res, result);
    } catch (err) {
      return next(err);
    }
  },
);

appDataRouter.get(
  "/api/v1/projects/:projectId/shared/:collection",
  requireAuth,
  async (req, res, next) => {
    try {
      const params = sharedQueryParamsSchema.safeParse(req.query);
      if (!params.success) {
        throw new AppError(400, "INVALID_INPUT", params.error.issues.map((i) => i.message).join(", "));
      }
      const result = await querySharedAppDataForUser(
        req.user.privyUserId,
        { projectId: req.params.projectId },
        { collection: req.params.collection, ...params.data },
      );
      return ok(req, res, result);
    } catch (err) {
      return next(err);
    }
  },
);

// --- Shared installation-scoped routes (cross-user reads) ---

appDataRouter.post(
  "/api/v1/installations/:installationId/shared/:collection",
  requireAuth,
  async (req, res, next) => {
    try {
      const parsed = storeBodySchema.safeParse({ ...req.body, collection: req.params.collection });
      if (!parsed.success) {
        throw new AppError(400, "INVALID_INPUT", parsed.error.issues.map((i) => i.message).join(", "));
      }
      const result = await storeSharedAppDataForUser(
        req.user.privyUserId,
        { installationId: req.params.installationId },
        parsed.data,
      );
      return ok(req, res, result);
    } catch (err) {
      return next(err);
    }
  },
);

appDataRouter.get(
  "/api/v1/installations/:installationId/shared/:collection",
  requireAuth,
  async (req, res, next) => {
    try {
      const params = sharedQueryParamsSchema.safeParse(req.query);
      if (!params.success) {
        throw new AppError(400, "INVALID_INPUT", params.error.issues.map((i) => i.message).join(", "));
      }
      const result = await querySharedAppDataForUser(
        req.user.privyUserId,
        { installationId: req.params.installationId },
        { collection: req.params.collection, ...params.data },
      );
      return ok(req, res, result);
    } catch (err) {
      return next(err);
    }
  },
);

// --- Installation-scoped routes ---

appDataRouter.post(
  "/api/v1/installations/:installationId/data",
  requireAuth,
  async (req, res, next) => {
    try {
      const parsed = storeBodySchema.safeParse(req.body);
      if (!parsed.success) {
        throw new AppError(400, "INVALID_INPUT", parsed.error.issues.map((i) => i.message).join(", "));
      }
      const result = await storeAppDataForUser(
        req.user.privyUserId,
        { installationId: req.params.installationId },
        parsed.data,
      );
      return ok(req, res, result);
    } catch (err) {
      return next(err);
    }
  },
);

appDataRouter.get(
  "/api/v1/installations/:installationId/data/:collection",
  requireAuth,
  async (req, res, next) => {
    try {
      const params = queryParamsSchema.safeParse(req.query);
      if (!params.success) {
        throw new AppError(400, "INVALID_INPUT", params.error.issues.map((i) => i.message).join(", "));
      }
      const result = await queryAppDataForUser(
        req.user.privyUserId,
        { installationId: req.params.installationId },
        { collection: req.params.collection, ...params.data },
      );
      return ok(req, res, result);
    } catch (err) {
      return next(err);
    }
  },
);

appDataRouter.delete(
  "/api/v1/installations/:installationId/data",
  requireAuth,
  async (req, res, next) => {
    try {
      const parsed = deleteBodySchema.safeParse(req.body);
      if (!parsed.success) {
        throw new AppError(400, "INVALID_INPUT", parsed.error.issues.map((i) => i.message).join(", "));
      }
      const result = await deleteAppDataForUser(
        req.user.privyUserId,
        { installationId: req.params.installationId },
        parsed.data,
      );
      return ok(req, res, result);
    } catch (err) {
      return next(err);
    }
  },
);

// --- Session-scoped routes (chat draft previews) ---

appDataRouter.post(
  "/api/v1/chat/sessions/:sessionId/data",
  requireAuth,
  async (req, res, next) => {
    try {
      const parsed = storeBodySchema.safeParse(req.body);
      if (!parsed.success) {
        throw new AppError(400, "INVALID_INPUT", parsed.error.issues.map((i) => i.message).join(", "));
      }
      const { findUserByPrivyId } = await import("../../../../services/auth/user.repository.js");
      const { findSessionForUser } = await import("../../../../services/conversation/session.repository.js");
      const user = await findUserByPrivyId(req.user.privyUserId);
      if (!user) throw new AppError(404, "USER_NOT_FOUND", "User not found");
      const session = await findSessionForUser(req.params.sessionId, user.id);
      if (!session) throw new AppError(404, "SESSION_NOT_FOUND", "Session not found");

      const { upsertAppData } = await import("../../../../services/app-data/app-data.repository.js");
      const row = await upsertAppData({
        projectId: `session:${req.params.sessionId}`,
        userId: user.id,
        collection: parsed.data.collection,
        key: parsed.data.key ?? null,
        data: parsed.data.data,
      });
      return ok(req, res, {
        id: row.id,
        collection: row.collection,
        key: row.key,
        data: row.data,
        created_at: row.created_at.toISOString(),
        updated_at: row.updated_at.toISOString(),
      });
    } catch (err) {
      return next(err);
    }
  },
);

appDataRouter.get(
  "/api/v1/chat/sessions/:sessionId/data/:collection",
  requireAuth,
  async (req, res, next) => {
    try {
      const params = queryParamsSchema.safeParse(req.query);
      if (!params.success) {
        throw new AppError(400, "INVALID_INPUT", params.error.issues.map((i) => i.message).join(", "));
      }
      const { findUserByPrivyId } = await import("../../../../services/auth/user.repository.js");
      const { findSessionForUser } = await import("../../../../services/conversation/session.repository.js");
      const user = await findUserByPrivyId(req.user.privyUserId);
      if (!user) throw new AppError(404, "USER_NOT_FOUND", "User not found");
      const session = await findSessionForUser(req.params.sessionId, user.id);
      if (!session) throw new AppError(404, "SESSION_NOT_FOUND", "Session not found");

      const { queryAppData, countAppData } = await import("../../../../services/app-data/app-data.repository.js");
      const projectId = `session:${req.params.sessionId}`;
      const [rows, total] = await Promise.all([
        queryAppData({
          projectId,
          userId: user.id,
          collection: req.params.collection,
          key: params.data.key,
          limit: params.data.limit,
          offset: params.data.offset,
          order: params.data.order,
        }),
        countAppData({
          projectId,
          userId: user.id,
          collection: req.params.collection,
        }),
      ]);
      return ok(req, res, {
        records: rows.map((r) => ({
          id: r.id,
          collection: r.collection,
          key: r.key,
          data: r.data,
          created_at: r.created_at.toISOString(),
          updated_at: r.updated_at.toISOString(),
        })),
        total,
        limit: params.data.limit,
        offset: params.data.offset,
      });
    } catch (err) {
      return next(err);
    }
  },
);

appDataRouter.delete(
  "/api/v1/chat/sessions/:sessionId/data",
  requireAuth,
  async (req, res, next) => {
    try {
      const parsed = deleteBodySchema.safeParse(req.body);
      if (!parsed.success) {
        throw new AppError(400, "INVALID_INPUT", parsed.error.issues.map((i) => i.message).join(", "));
      }
      const { findUserByPrivyId } = await import("../../../../services/auth/user.repository.js");
      const { findSessionForUser } = await import("../../../../services/conversation/session.repository.js");
      const user = await findUserByPrivyId(req.user.privyUserId);
      if (!user) throw new AppError(404, "USER_NOT_FOUND", "User not found");
      const session = await findSessionForUser(req.params.sessionId, user.id);
      if (!session) throw new AppError(404, "SESSION_NOT_FOUND", "Session not found");

      const { deleteAppData } = await import("../../../../services/app-data/app-data.repository.js");
      const count = await deleteAppData({
        projectId: `session:${req.params.sessionId}`,
        userId: user.id,
        collection: parsed.data.collection,
        key: parsed.data.key,
        id: parsed.data.id,
      });
      return ok(req, res, { deleted: count });
    } catch (err) {
      return next(err);
    }
  },
);
