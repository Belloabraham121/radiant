import { Router } from "express";
import { ZodError, z } from "zod";
import { requireAuth } from "../../../middleware/auth.js";
import {
  getDeployJobForUser,
  startDeployForUser,
} from "../../../../services/deploy/deploy.service.js";
import { fail, ok } from "../../../../utils/http-response.js";

const deployRequestSchema = z.object({
  project_id: z.string().uuid(),
});

export const deployRouter = Router();

deployRouter.post("/api/v1/deploy", requireAuth, async (req, res, next) => {
  try {
    const body = deployRequestSchema.parse(req.body);
    const idempotencyKey = req.header("idempotency-key") ?? req.header("Idempotency-Key");
    const data = await startDeployForUser(req.user.privyUserId, body.project_id, idempotencyKey);
    return ok(req, res, data, 202);
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

deployRouter.get("/api/v1/deploy/:jobId", requireAuth, async (req, res, next) => {
  try {
    const data = await getDeployJobForUser(req.user.privyUserId, req.params.jobId);
    return ok(req, res, data);
  } catch (err) {
    next(err);
  }
});
