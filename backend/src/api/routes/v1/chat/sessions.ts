import { Router } from "express";
import { ZodError } from "zod";
import { requireAuth } from "../../../middleware/auth.js";
import {
  createSessionSchema,
} from "../../../../services/conversation/conversation.types.js";
import {
  createUserSession,
  deleteUserSession,
  getSessionMessages,
  listUserSessions,
} from "../../../../services/conversation/conversation.service.js";
import { listSessionTransactions } from "../../../../services/agent-transaction/agent-transaction.service.js";
import {
  requireAgentStreamSession,
  subscribeAgentStream,
} from "../../../../services/agent/agent-stream.service.js";
import { drainPendingExecuteInApp } from "../../../../services/agent/agent-stream-pending-execute.js";
import { fail, ok } from "../../../../utils/http-response.js";
import { writeSseComment, writeSseEvent } from "../../../../utils/chat-sse.js";

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

chatSessionsRouter.delete(
  "/api/v1/chat/sessions/:sessionId",
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

      const data = await deleteUserSession(req.user.privyUserId, sessionId);
      return ok(req, res, data);
    } catch (err) {
      next(err);
    }
  },
);

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

chatSessionsRouter.get(
  "/api/v1/chat/sessions/:sessionId/agent-stream",
  requireAuth,
  async (req, res, next) => {
    const sessionId = req.params.sessionId;
    if (!sessionId) {
      return fail(req, res, 400, {
        code: "VALIDATION_ERROR",
        message: "sessionId is required",
      });
    }

    try {
      await requireAgentStreamSession(req.user.privyUserId, sessionId);
    } catch (err) {
      return next(err);
    }

    res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders?.();

    writeSseEvent(res, "connected", { session_id: sessionId });

    const pendingItems = drainPendingExecuteInApp(sessionId);
    for (const pending of pendingItems) {
      writeSseEvent(res, "agent_thinking", { session_id: sessionId, active: true, action: pending.action });
      writeSseEvent(res, "agent_action", {
        session_id: sessionId,
        ts: pending.created_at,
        action: pending.action,
        params: pending.params,
        step: "execute_in_app",
        animate: true,
      });
      writeSseEvent(res, "agent_thinking", { session_id: sessionId, active: false, action: pending.action });
    }

    const unsubscribe = subscribeAgentStream(sessionId, (event) => {
      if (res.writableEnded) {
        return;
      }
      const { type, ...data } = event;
      writeSseEvent(res, type, data);
    });

    const heartbeat = setInterval(() => {
      if (res.writableEnded) {
        return;
      }
      writeSseComment(res, "keepalive");
    }, 25_000);

    req.on("close", () => {
      clearInterval(heartbeat);
      unsubscribe();
      if (!res.writableEnded) {
        res.end();
      }
    });
  },
);

chatSessionsRouter.get(
  "/api/v1/chat/sessions/:sessionId/transactions",
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

      const items = await listSessionTransactions(req.user.privyUserId, sessionId);
      return ok(req, res, { items });
    } catch (err) {
      next(err);
    }
  },
);
