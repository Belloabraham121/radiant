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
import { saveSessionDraftToProjectForUser } from "../../../../services/projects/generate-app.service.js";
import { getChatSessionAppScopeForUser } from "../../../../services/projects/chat-app-scope.service.js";
import { listSessionTransactions } from "../../../../services/agent-transaction/agent-transaction.service.js";
import {
  listAppActionsCatalogForSession,
} from "../../../../services/projects/app-action-catalog.service.js";
import { parseAppActionName } from "../../../../services/projects/app-action-mapper.js";
import {
  executeAppActionForSession,
} from "../../../../services/projects/app-action.service.js";
import {
  flashLoanQuoteForSession,
  governanceStateForSession,
  marginManagerInfoForSession,
  marginOpenOrdersForSession,
  marginPoolInfoForSession,
  marginRiskRatioForSession,
  openOrdersForSession,
  poolInfoForSession,
  stakeBalanceForSession,
  swapQuoteForSession,
} from "../../../../services/projects/session-platform.service.js";
import { readAppActionSessionId } from "../../../../utils/app-action-request-context.js";
import {
  RADIANT_CLIENT_TEMPLATE_VERSION,
  RADIANT_CLIENT_TS,
} from "../../../../services/projects/radiant-client-template.js";
import {
  requireAgentStreamSession,
  subscribeAgentStream,
} from "../../../../services/agent/agent-stream.service.js";
import { drainPendingExecuteInApp } from "../../../../services/agent/agent-stream-pending-execute.js";
import { fail, ok } from "../../../../utils/http-response.js";
import { registerMarginDeepbookReadRoutes } from "../margin-deepbook-read.routes.js";
import { registerDeepbookIndexerReadRoutes } from "../deepbook-indexer-read.routes.js";
import { writeSseComment, writeSseEvent } from "../../../../utils/chat-sse.js";

export const chatSessionsRouter = Router();

chatSessionsRouter.get("/api/v1/platform/radiant-client", requireAuth, async (req, res) => {
  return ok(req, res, {
    version: RADIANT_CLIENT_TEMPLATE_VERSION,
    content: RADIANT_CLIENT_TS,
  });
});

chatSessionsRouter.post("/api/v1/platform/prepare-artifact-preview", requireAuth, async (req, res, next) => {
  try {
    const body = req.body as { files?: Array<{ path: string; content: string }>; template?: string };
    if (!Array.isArray(body.files) || body.files.length === 0) {
      return fail(req, res, 400, {
        code: "VALIDATION_ERROR",
        message: "files array is required",
      });
    }
    const { ensureAppEntry } = await import("../../../../services/projects/ensure-app-entry.js");
    const files = ensureAppEntry(body.files, { template: body.template });
    return ok(req, res, { files });
  } catch (err) {
    next(err);
  }
});

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

chatSessionsRouter.get(
  "/api/v1/chat/sessions/:sessionId/app-scope",
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

      const data = await getChatSessionAppScopeForUser(req.user.privyUserId, sessionId);
      return ok(req, res, data);
    } catch (err) {
      next(err);
    }
  },
);

chatSessionsRouter.post(
  "/api/v1/chat/sessions/:sessionId/draft/save",
  requireAuth,
  async (req, res, next) => {
    try {
      const data = await saveSessionDraftToProjectForUser(
        req.user.privyUserId,
        req.params.sessionId,
        req.body ?? {},
      );
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
    // #region agent log
    if (pendingItems.length > 0) { fetch('http://127.0.0.1:7727/ingest/ba4178db-490a-47e6-86f6-f9c3bd2838e2',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'870759'},body:JSON.stringify({sessionId:'870759',location:'sessions.ts:agent-stream-drain',message:'DRAINING buffered execute_in_app events',data:{count:pendingItems.length,actions:pendingItems.map(p=>p.action),sseSessionId:sessionId},hypothesisId:'H5',timestamp:Date.now()})}).catch(()=>{}); }
    // #endregion
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

chatSessionsRouter.post(
  "/api/v1/chat/sessions/:sessionId/swap/quote",
  requireAuth,
  async (req, res, next) => {
    try {
      const data = await swapQuoteForSession(
        req.user.privyUserId,
        req.params.sessionId,
        req.body,
      );
      return ok(req, res, data);
    } catch (err) {
      next(err);
    }
  },
);

chatSessionsRouter.get(
  "/api/v1/chat/sessions/:sessionId/deepbook/pool-info",
  requireAuth,
  async (req, res, next) => {
    try {
      const data = await poolInfoForSession(
        req.user.privyUserId,
        req.params.sessionId,
        req.query,
      );
      return ok(req, res, data);
    } catch (err) {
      next(err);
    }
  },
);

chatSessionsRouter.post(
  "/api/v1/chat/sessions/:sessionId/deepbook/flash-loan/quote",
  requireAuth,
  async (req, res, next) => {
    try {
      const data = await flashLoanQuoteForSession(
        req.user.privyUserId,
        req.params.sessionId,
        req.body,
      );
      return ok(req, res, data);
    } catch (err) {
      next(err);
    }
  },
);

chatSessionsRouter.get(
  "/api/v1/chat/sessions/:sessionId/deepbook/open-orders",
  requireAuth,
  async (req, res, next) => {
    try {
      const data = await openOrdersForSession(
        req.user.privyUserId,
        req.params.sessionId,
        req.query,
      );
      return ok(req, res, data);
    } catch (err) {
      next(err);
    }
  },
);

chatSessionsRouter.get(
  "/api/v1/chat/sessions/:sessionId/deepbook/stake-balance",
  requireAuth,
  async (req, res, next) => {
    try {
      const data = await stakeBalanceForSession(
        req.user.privyUserId,
        req.params.sessionId,
        req.query,
      );
      return ok(req, res, data);
    } catch (err) {
      next(err);
    }
  },
);

chatSessionsRouter.get(
  "/api/v1/chat/sessions/:sessionId/deepbook/governance-state",
  requireAuth,
  async (req, res, next) => {
    try {
      const data = await governanceStateForSession(
        req.user.privyUserId,
        req.params.sessionId,
        req.query,
      );
      return ok(req, res, data);
    } catch (err) {
      next(err);
    }
  },
);

chatSessionsRouter.get(
  "/api/v1/chat/sessions/:sessionId/deepbook/margin-manager-info",
  requireAuth,
  async (req, res, next) => {
    try {
      const data = await marginManagerInfoForSession(
        req.user.privyUserId,
        req.params.sessionId,
        req.query,
      );
      return ok(req, res, data);
    } catch (err) {
      next(err);
    }
  },
);

chatSessionsRouter.get(
  "/api/v1/chat/sessions/:sessionId/deepbook/margin-pool-info",
  requireAuth,
  async (req, res, next) => {
    try {
      const data = await marginPoolInfoForSession(
        req.user.privyUserId,
        req.params.sessionId,
        req.query,
      );
      return ok(req, res, data);
    } catch (err) {
      next(err);
    }
  },
);

chatSessionsRouter.get(
  "/api/v1/chat/sessions/:sessionId/deepbook/margin-risk-ratio",
  requireAuth,
  async (req, res, next) => {
    try {
      const data = await marginRiskRatioForSession(
        req.user.privyUserId,
        req.params.sessionId,
        req.query,
      );
      return ok(req, res, data);
    } catch (err) {
      next(err);
    }
  },
);

chatSessionsRouter.get(
  "/api/v1/chat/sessions/:sessionId/deepbook/margin-open-orders",
  requireAuth,
  async (req, res, next) => {
    try {
      const data = await marginOpenOrdersForSession(
        req.user.privyUserId,
        req.params.sessionId,
        req.query,
      );
      return ok(req, res, data);
    } catch (err) {
      next(err);
    }
  },
);

chatSessionsRouter.get(
  "/api/v1/chat/sessions/:sessionId/actions",
  requireAuth,
  async (req, res, next) => {
    try {
      const data = await listAppActionsCatalogForSession(
        req.user.privyUserId,
        req.params.sessionId,
      );
      return ok(req, res, data);
    } catch (err) {
      next(err);
    }
  },
);

chatSessionsRouter.post(
  "/api/v1/chat/sessions/:sessionId/actions/:actionName",
  requireAuth,
  async (req, res, next) => {
    try {
      const action = parseAppActionName(req.params.actionName);
      const headerSessionId = readAppActionSessionId(req);
      const result = await executeAppActionForSession(
        req.user.privyUserId,
        req.params.sessionId,
        action,
        req.body,
        {
          source: "ui",
          ...(headerSessionId ? { sessionId: headerSessionId } : {}),
        },
      );
      return ok(req, res, result);
    } catch (err) {
      next(err);
    }
  },
);

registerMarginDeepbookReadRoutes(chatSessionsRouter, "session");
registerDeepbookIndexerReadRoutes(chatSessionsRouter, "session");
