import { getE2bWebhookConfig } from "../../config/e2b.js";
import { AppError } from "../../errors/app-error.js";
import { reconcileDeployJobOnSandboxKilled } from "../deploy/deploy-job.repository.js";
import { logger } from "../../shared/logger.js";
import type { E2bLifecycleWebhookPayload } from "./e2b-lifecycle.types.js";
import { verifyE2bWebhookSignature } from "./e2b-webhook-signature.js";

export type E2bLifecycleWebhookHeaders = {
  webhookId?: string;
  deliveryId?: string;
  signature?: string;
};

export type HandleE2bLifecycleWebhookResult = {
  received: true;
  event_type: string;
  sandbox_id: string | null;
  reconcile: {
    jobId: string | null;
    action: string;
  } | null;
};

function parsePayload(raw: unknown): E2bLifecycleWebhookPayload {
  if (!raw || typeof raw !== "object") {
    throw new AppError(400, "INVALID_WEBHOOK", "Webhook body must be a JSON object.");
  }

  const payload = raw as E2bLifecycleWebhookPayload;
  if (!payload.type || typeof payload.type !== "string") {
    throw new AppError(400, "INVALID_WEBHOOK", "Missing event type in webhook payload.");
  }

  return payload;
}

function metadataJobId(metadata: Record<string, string> | undefined): string | undefined {
  if (!metadata) return undefined;
  return metadata.jobId ?? metadata.job_id ?? undefined;
}

export async function handleE2bLifecycleWebhook(
  rawBody: string,
  payload: unknown,
  headers: E2bLifecycleWebhookHeaders,
): Promise<HandleE2bLifecycleWebhookResult> {
  const { signatureSecret } = getE2bWebhookConfig();
  if (!signatureSecret) {
    throw new AppError(
      503,
      "WEBHOOK_NOT_CONFIGURED",
      "E2B_WEBHOOK_SIGNATURE_SECRET is not configured on the server.",
    );
  }

  if (!headers.signature) {
    throw new AppError(400, "INVALID_WEBHOOK", "Missing e2b-signature header.");
  }

  if (!verifyE2bWebhookSignature(signatureSecret, rawBody, headers.signature)) {
    throw new AppError(401, "INVALID_WEBHOOK", "E2B webhook signature verification failed.");
  }

  const event = parsePayload(payload);
  const sandboxId = event.sandbox_id ?? null;

  logger.info("E2B lifecycle webhook received", {
    e2b_webhook_id: headers.webhookId,
    e2b_delivery_id: headers.deliveryId,
    event_type: event.type,
    event_label: event.event_label,
    sandbox_id: sandboxId,
    sandbox_execution_id: event.sandbox_execution_id,
  });

  if (event.type !== "sandbox.lifecycle.killed" || !sandboxId) {
    return {
      received: true,
      event_type: event.type,
      sandbox_id: sandboxId,
      reconcile: null,
    };
  }

  const metadata = event.event_data?.sandbox_metadata;
  const jobId = metadataJobId(metadata);
  const executionTimeMs = event.event_data?.execution?.execution_time;

  const reconcile = await reconcileDeployJobOnSandboxKilled({
    sandboxId,
    jobId,
    executionTimeMs,
    killReason: "Sandbox killed (E2B lifecycle webhook).",
  });

  if (reconcile.action !== "ignored") {
    logger.info("DeployJob reconciled from E2B kill webhook", {
      sandbox_id: sandboxId,
      job_id: reconcile.jobId,
      action: reconcile.action,
      execution_time_ms: executionTimeMs,
    });
  }

  return {
    received: true,
    event_type: event.type,
    sandbox_id: sandboxId,
    reconcile: {
      jobId: reconcile.jobId,
      action: reconcile.action,
    },
  };
}
