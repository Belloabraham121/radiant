import { Router } from "express";
import { ZodError } from "zod";
import { requireAuth } from "../../../middleware/auth.js";
import {
  createSessionSchema,
} from "../../../../services/conversation/conversation.types.js";
import {
  createUserSession,
  getSessionMessages,
  listUserSessions,
} from "../../../../services/conversation/conversation.service.js";
import { fail, ok } from "../../../../utils/http-response.js";

export const chatSessionsRouter = Router();

chatSessionsRouter.get("/api/v1/chat/sessions", requireAuth, async (req, res, next) => {
  try {
    const data = await listUserSessions(req.user.privyUserId);
    return ok(req, res, data);
  } catch (err) {
    next(err);
  }
});

chatSessionsRouter.post("/api/v1/chat/sessions", requireAuth, async (req, res, next) => {
  try {
    const body = createSessionSchema.parse(req.body ?? {});
    const data = await createUserSession(req.user.privyUserId, body);
    return ok(req, res, data, 201);
  } catch (err) {
    if (err instanceof ZodError) {
      return fail(req, res, 400, {
        code: "VALIDATION_ERROR",
        message: "Invalid request body",
        details: err.flatten(),
      });
    }
    next(err);
  }
});

chatSessionsRouter.get(
  "/api/v1/chat/sessions/:sessionId/messages",
  requireAuth,
  async (req, res, next) => {
    try {
      const sessionId = req.params.sessionId;
      if (!sessionId) {
        return fail(req, res, 400, {
          code: "VALIDATION_ERROR",
          message: "sessionId is required",
        });
      }

      const data = await getSessionMessages(req.user.privyUserId, sessionId);
      return ok(req, res, data);
    } catch (err) {
      next(err);
    }
  },
);
