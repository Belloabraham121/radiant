import type { NotificationEvent, NotificationPushSubscription } from "@prisma/client";
import webpush from "web-push";
import { getVapidConfig } from "../../config/vapid.js";
import {
  deletePushSubscriptionByEndpoint,
  listActivePushSubscriptionsForUser,
  touchPushSubscriptionUsed,
} from "./notification-push-subscription.repository.js";
import type { NotificationEventPayload } from "./notification-schema.types.js";
import { logStalePushSubscriptionRemoved } from "./notification-observability.service.js";

export type WebPushDeliveryResult =
  | { status: "sent"; delivered_count: number }
  | { status: "skipped"; reason: string }
  | { status: "failed"; reason: string; delivered_count: number };

let vapidConfigured = false;

function ensureVapidConfigured(): boolean {
  const config = getVapidConfig();
  if (!config.enabled || !config.publicKey || !config.privateKey) {
    return false;
  }

  if (!vapidConfigured) {
    webpush.setVapidDetails(config.subject, config.publicKey, config.privateKey);
    vapidConfigured = true;
  }

  return true;
}

export function resolveNotificationDeepLink(input: {
  payload: NotificationEventPayload;
  projectId: string | null;
  installationId: string | null;
}): string {
  if (input.payload.deep_link) {
    const link = input.payload.deep_link;
    if (link.startsWith("http://") || link.startsWith("https://")) {
      try {
        const url = new URL(link);
        return `${url.pathname}${url.search}${url.hash}`;
      } catch {
        return link;
      }
    }
    return link.startsWith("/") ? link : `/${link}`;
  }

  if (input.installationId) {
    return `/app/installed/${input.installationId}/run`;
  }

  if (input.projectId) {
    return `/app/projects/${input.projectId}/run`;
  }

  return "/app/projects";
}

function buildPushPayload(input: {
  event: NotificationEvent;
  payload: NotificationEventPayload;
}): string {
  const url = resolveNotificationDeepLink({
    payload: input.payload,
    projectId: input.event.project_id,
    installationId: input.event.installation_id,
  });

  return JSON.stringify({
    title: input.event.title,
    body: input.event.body,
    data: {
      url,
      event_id: input.event.id,
      notification_type: input.event.notification_type,
      severity: input.payload.severity ?? "info",
    },
  });
}

function isStaleSubscriptionError(statusCode?: number): boolean {
  return statusCode === 404 || statusCode === 410;
}

async function sendToSubscription(
  subscription: NotificationPushSubscription,
  payload: string,
): Promise<{ ok: true } | { ok: false; stale: boolean; message: string }> {
  try {
    await webpush.sendNotification(
      {
        endpoint: subscription.endpoint,
        keys: {
          p256dh: subscription.p256dh,
          auth: subscription.auth,
        },
      },
      payload,
    );
    await touchPushSubscriptionUsed(subscription.id);
    return { ok: true };
  } catch (error) {
    const statusCode =
      error && typeof error === "object" && "statusCode" in error
        ? Number((error as { statusCode?: number }).statusCode)
        : undefined;
    const message = error instanceof Error ? error.message : "Web Push send failed";

    if (isStaleSubscriptionError(statusCode)) {
      await deletePushSubscriptionByEndpoint(subscription.endpoint);
      logStalePushSubscriptionRemoved({
        userId: subscription.user_id,
        endpoint: subscription.endpoint,
      });
      return { ok: false, stale: true, message };
    }

    return { ok: false, stale: false, message };
  }
}

export async function deliverWebPushNotification(input: {
  userId: bigint;
  event: NotificationEvent;
  payload: NotificationEventPayload;
}): Promise<WebPushDeliveryResult> {
  if (!ensureVapidConfigured()) {
    return { status: "skipped", reason: "Web Push not configured" };
  }

  const subscriptions = await listActivePushSubscriptionsForUser(input.userId);
  if (subscriptions.length === 0) {
    return { status: "skipped", reason: "No push subscriptions" };
  }

  const payload = buildPushPayload(input);
  let deliveredCount = 0;
  const errors: string[] = [];

  for (const subscription of subscriptions) {
    const result = await sendToSubscription(subscription, payload);
    if (result.ok) {
      deliveredCount += 1;
    } else if (!result.stale) {
      errors.push(result.message);
    }
  }

  if (deliveredCount > 0) {
    return { status: "sent", delivered_count: deliveredCount };
  }

  return {
    status: "failed",
    reason: errors[0] ?? "All push subscriptions failed",
    delivered_count: 0,
  };
}

export function resetWebPushVapidForTests(): void {
  vapidConfigured = false;
}
