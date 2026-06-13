import { Router } from "express";
import { ZodError } from "zod";
import { requireAuth } from "../../../middleware/auth.js";
import { chatRequestSchema } from "../../../../services/agent/agent.types.js";
import { handleChatMessage, handleChatMessageStream } from "../../../../services/agent/chat.service.js";
import { fail, ok } from "../../../../utils/http-response.js";
import { writeSseEvent } from "../../../../utils/chat-sse.js";

export const chatRouter = Router();

function wantsEventStream(req: { query: { stream?: unknown }; headers: { accept?: string } }): boolean {
  return req.query.stream === "1" || (req.headers.accept?.includes("text/event-stream") ?? false);
}

chatRouter.post("/api/v1/chat", requireAuth, async (req, res, next) => {
  try {
    const body = chatRequestSchema.parse(req.body);

    if (wantsEventStream(req)) {
      res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
      res.setHeader("Cache-Control", "no-cache, no-transform");
      res.setHeader("Connection", "keep-alive");
      res.flushHeaders?.();

      const send: Parameters<typeof handleChatMessageStream>[2] = (event, data) => {
        writeSseEvent(res, event, data);
      };

      try {
        await handleChatMessageStream(req.user.privyUserId, body, send);
      } catch (err) {
        if (!res.writableEnded) {
          const message =
            err instanceof Error ? err.message : "Agent request failed.";
          writeSseEvent(res, "error", { message });
        }
      }

      res.end();
      return;
    }

    const data = await handleChatMessage(req.user.privyUserId, body);
    return ok(req, res, data);
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
