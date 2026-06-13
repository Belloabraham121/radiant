import { Router } from "express";
import { ZodError } from "zod";
import { requireAuth } from "../../../middleware/auth.js";
import {
  getAgentPermissions,
  updateAgentPermissions,
} from "../../../../services/agent/agent-permissions.service.js";
import { updateAgentPermissionsSchema } from "../../../../services/agent/agent-permissions.types.js";
import { fail, ok } from "../../../../utils/http-response.js";

export const agentPermissionsRouter = Router();

agentPermissionsRouter.get("/api/v1/agent/permissions", requireAuth, async (req, res, next) => {
  try {
    const permissions = await getAgentPermissions(req.user.privyUserId);
    return ok(req, res, permissions);
  } catch (err) {
    next(err);
  }
});

agentPermissionsRouter.patch("/api/v1/agent/permissions", requireAuth, async (req, res, next) => {
  try {
    const body = updateAgentPermissionsSchema.parse(req.body);
    const permissions = await updateAgentPermissions(req.user.privyUserId, body);
    return ok(req, res, permissions);
  } catch (err) {
    if (err instanceof ZodError) {
      return fail(req, res, 400, {
        code: "VALIDATION_ERROR",
        message: "Invalid permissions payload",
        details: err.flatten(),
      });
    }
    next(err);
  }
});
