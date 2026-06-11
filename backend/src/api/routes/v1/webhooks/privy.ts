import { Router } from "express";
import { getPrivyEnv } from "../../../../config/env.js";
import { AppError } from "../../../../errors/app-error.js";
import { getPrivyClient } from "../../../../infrastructure/privy/client.js";
import { handlePrivyWebhookEvent } from "../../../../services/auth/privy-webhook.service.js";
import { ok } from "../../../../utils/http-response.js";

export const privyWebhookRouter = Router();

privyWebhookRouter.post("/", async (req, res, next) => {
  try {
    const rawBody = req.body;
    if (!Buffer.isBuffer(rawBody)) {
      throw new AppError(400, "INVALID_WEBHOOK", "Webhook body must be raw JSON.");
    }

    const svixId = req.header("svix-id");
    const svixTimestamp = req.header("svix-timestamp");
    const svixSignature = req.header("svix-signature");
    if (!svixId || !svixTimestamp || !svixSignature) {
      throw new AppError(400, "INVALID_WEBHOOK", "Missing Svix webhook headers.");
    }

    const { PRIVY_WEBHOOK_SIGNING_SECRET } = getPrivyEnv();
    if (!PRIVY_WEBHOOK_SIGNING_SECRET) {
      throw new AppError(
        503,
        "WEBHOOK_NOT_CONFIGURED",
        "PRIVY_WEBHOOK_SIGNING_SECRET is not configured on the server.",
      );
    }

    let payload: unknown;
    try {
      payload = JSON.parse(rawBody.toString("utf8")) as unknown;
    } catch {
      throw new AppError(400, "INVALID_WEBHOOK", "Webhook body is not valid JSON.");
    }

    let verified: unknown;
    try {
      verified = await getPrivyClient().webhooks().verify({
        payload: payload as object,
        svix: {
          id: svixId,
          timestamp: svixTimestamp,
          signature: svixSignature,
        },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Webhook verification failed";
      throw new AppError(401, "INVALID_WEBHOOK", message);
    }

    await handlePrivyWebhookEvent(verified);
    return ok(req, res, { received: true });
  } catch (err) {
    next(err);
  }
});
