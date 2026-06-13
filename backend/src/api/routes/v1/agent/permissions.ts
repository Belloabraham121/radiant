import { Router } from "express";
import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
import { requireAuth } from "../../../middleware/auth.js";
import {
  getAgentPermissions,
  updateAgentPermissions,
} from "../../../../services/agent/agent-permissions.service.js";
import { updateAgentPermissionsSchema } from "../../../../services/agent/agent-permissions.types.js";
import { fail, ok } from "../../../../utils/http-response.js";

export const agentPermissionsRouter = Router();

async function readPermissions(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const permissions = await getAgentPermissions(req.user.privyUserId);
    ok(req, res, permissions);
  } catch (err) {
    next(err);
  }
}

async function patchPermissions(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const body = updateAgentPermissionsSchema.parse(req.body);
    const permissions = await updateAgentPermissions(req.user.privyUserId, body);
    ok(req, res, permissions);
  } catch (err) {
    if (err instanceof ZodError) {
      fail(req, res, 400, {
        code: "VALIDATION_ERROR",
        message: "Invalid permissions payload",
        details: err.flatten(),
      });
      return;
    }
    next(err);
  }
}

agentPermissionsRouter.get("/api/v1/agent/permissions", requireAuth, readPermissions);
agentPermissionsRouter.patch("/api/v1/agent/permissions", requireAuth, patchPermissions);

/** Alias paths documented in deepbook-v3-TODO Phase J. */
agentPermissionsRouter.get("/api/v1/users/me/permissions", requireAuth, readPermissions);
agentPermissionsRouter.patch("/api/v1/users/me/permissions", requireAuth, patchPermissions);
