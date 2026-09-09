import { Router } from "express";
import { ZodError } from "zod";
import { waitlistRateLimitMiddleware } from "../../../middleware/auth-rate-limit.js";
import { signupWaitlistEmail } from "../../../../services/waitlist/waitlist.service.js";
import { waitlistBodySchema } from "../../../../services/waitlist/waitlist.types.js";
import { fail, ok } from "../../../../utils/http-response.js";

export const waitlistRouter = Router();

waitlistRouter.post(
  "/api/v1/waitlist",
  waitlistRateLimitMiddleware,
  async (req, res, next) => {
    try {
      const body = waitlistBodySchema.parse(req.body);
      const result = await signupWaitlistEmail(body);
      return ok(req, res, result, result.created ? 201 : 200);
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
  },
);
