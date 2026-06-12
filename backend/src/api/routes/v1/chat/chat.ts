import { Router } from "express";
import { ZodError } from "zod";
import { requireAuth } from "../../../middleware/auth.js";
import { chatRequestSchema } from "../../../../services/agent/agent.types.js";
import { handleChatMessage } from "../../../../services/agent/chat.service.js";
import { fail, ok } from "../../../../utils/http-response.js";

export const chatRouter = Router();

chatRouter.post("/api/v1/chat", requireAuth, async (req, res, next) => {
  try {
    const body = chatRequestSchema.parse(req.body);
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
