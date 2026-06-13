import { Router } from "express";
import { handleE2bLifecycleWebhook } from "../../../../services/sandbox/e2b-lifecycle-webhook.service.js";
import { AppError } from "../../../../errors/app-error.js";
import { ok } from "../../../../utils/http-response.js";

export const e2bWebhookRouter = Router();

e2bWebhookRouter.post("/", async (req, res, next) => {
  try {
    const rawBody = req.body;
    if (!Buffer.isBuffer(rawBody)) {
      throw new AppError(400, "INVALID_WEBHOOK", "Webhook body must be raw JSON.");
    }

    const rawString = rawBody.toString("utf8");
    let payload: unknown;
    try {
      payload = JSON.parse(rawString) as unknown;
    } catch {
      throw new AppError(400, "INVALID_WEBHOOK", "Webhook body is not valid JSON.");
    }

    const result = await handleE2bLifecycleWebhook(rawString, payload, {
      webhookId: req.header("e2b-webhook-id"),
      deliveryId: req.header("e2b-delivery-id"),
      signature: req.header("e2b-signature"),
    });

    return ok(req, res, result);
  } catch (err) {
    next(err);
  }
});
