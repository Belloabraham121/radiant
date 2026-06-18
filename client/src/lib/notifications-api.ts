import { apiFetch } from "./api";

export type NotificationChannel = "in_app" | "web_push" | "email";

export type NotificationEventRecord = {
  id: string;
  notification_type: string;
  title: string;
  body: string;
  payload: {
    deep_link?: string;
    data?: Record<string, unknown>;
    rule_id?: string;
    severity?: "info" | "warning" | "critical";
  };
  project_id: string | null;
  installation_id: string | null;
  rule_id: string | null;
  created_at: string;
  unread: boolean;
};

export type NotificationRuleRecord = {
  id: string;
  notification_type: string;
  label: string | null;
  status: string;
  condition: Record<string, unknown>;
  trigger_kind: string;
  channels: NotificationChannel[];
  created_at: string;
};

export type NotificationPreferences = {
  enabled: boolean;
  timezone: string;
  quiet_hours_start: string | null;
  quiet_hours_end: string | null;
  max_per_hour: number;
  default_channels: NotificationChannel[];
  updated_at: string;
};

export type ProjectNotificationSchema = {
  schema_version: number;
  app_id: string;
  types: Array<{
    type: string;
    label: string;
    description?: string;
    trigger_kind: string;
  }>;
};

export type PushConfig = {
  enabled: boolean;
  public_key: string | null;
};

export type PushSubscriptionRecord = {
  id: string;
  endpoint: string;
  user_agent: string | null;
  created_at: string;
  last_used_at: string | null;
};

function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray as Uint8Array<ArrayBuffer>;
}

export function isWebPushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

export async function fetchPushConfig(): Promise<PushConfig> {
  return apiFetch<PushConfig>("/api/v1/notifications/push/config");
}

export async function listPushSubscriptions(): Promise<PushSubscriptionRecord[]> {
  const data = await apiFetch<{ subscriptions: PushSubscriptionRecord[] }>(
    "/api/v1/notifications/push/subscriptions",
  );
  return data.subscriptions;
}

export async function registerNotificationServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!isWebPushSupported()) {
    return null;
  }

  try {
    return await navigator.serviceWorker.register("/sw.js", { scope: "/" });
  } catch {
    return null;
  }
}

export async function subscribeWebPush(): Promise<{ subscribed: boolean; subscription_id?: string }> {
  if (!isWebPushSupported()) {
    return { subscribed: false };
  }

  const config = await fetchPushConfig();
  if (!config.enabled || !config.public_key) {
    return { subscribed: false };
  }

  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    return { subscribed: false };
  }

  const registration =
    (await navigator.serviceWorker.getRegistration("/")) ??
    (await registerNotificationServiceWorker());
  if (!registration) {
    return { subscribed: false };
  }

  await navigator.serviceWorker.ready;

  const existing = await registration.pushManager.getSubscription();
  const subscription =
    existing ??
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(config.public_key),
    }));

  const json = subscription.toJSON();
  if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
    return { subscribed: false };
  }

  const record = await apiFetch<PushSubscriptionRecord>("/api/v1/notifications/push/subscribe", {
    method: "POST",
    body: JSON.stringify({
      endpoint: json.endpoint,
      keys: {
        p256dh: json.keys.p256dh,
        auth: json.keys.auth,
      },
      user_agent: navigator.userAgent,
    }),
  });

  return { subscribed: true, subscription_id: record.id };
}

export type TestWebPushResult = {
  status: string;
  event_id?: string;
  reason?: string;
  skipped_channels?: NotificationChannel[];
};

export async function sendTestWebPush(): Promise<TestWebPushResult> {
  return apiFetch<TestWebPushResult>("/api/v1/notifications/push/test", {
    method: "POST",
  });
}

export async function unsubscribeWebPush(subscriptionId: string): Promise<void> {
  await apiFetch<{ id: string; revoked: true }>(
    `/api/v1/notifications/push/subscribe/${subscriptionId}`,
    { method: "DELETE" },
  );

  const registration = await navigator.serviceWorker.getRegistration("/");
  const subscription = await registration?.pushManager.getSubscription();
  if (subscription) {
    await subscription.unsubscribe();
  }
}

export async function listNotificationEvents(options: {
  unread?: boolean;
  limit?: number;
  offset?: number;
} = {}): Promise<{ events: NotificationEventRecord[]; total: number }> {
  const qs = new URLSearchParams();
  if (options.unread !== undefined) qs.set("unread", options.unread ? "true" : "false");
  if (options.limit) qs.set("limit", String(options.limit));
  if (options.offset) qs.set("offset", String(options.offset));
  const query = qs.toString();
  return apiFetch<{ events: NotificationEventRecord[]; total: number }>(
    `/api/v1/notifications/events${query ? `?${query}` : ""}`,
  );
}

export async function markNotificationEventRead(eventId: string): Promise<{ event_id: string; read_at: string }> {
  return apiFetch<{ event_id: string; read_at: string }>(
    `/api/v1/notifications/events/${encodeURIComponent(eventId)}/read`,
    { method: "POST" },
  );
}

export async function fetchNotificationPreferences(): Promise<NotificationPreferences> {
  return apiFetch<NotificationPreferences>("/api/v1/notifications/preferences");
}

export async function patchNotificationPreferences(
  input: Partial<
    Pick<
      NotificationPreferences,
      "enabled" | "timezone" | "quiet_hours_start" | "quiet_hours_end" | "max_per_hour" | "default_channels"
    >
  >,
): Promise<NotificationPreferences> {
  return apiFetch<NotificationPreferences>("/api/v1/notifications/preferences", {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export async function listNotificationRules(options: {
  project_id?: string;
  installation_id?: string;
  status?: string;
  limit?: number;
} = {}): Promise<{ rules: NotificationRuleRecord[]; total: number }> {
  const qs = new URLSearchParams();
  if (options.project_id) qs.set("project_id", options.project_id);
  if (options.installation_id) qs.set("installation_id", options.installation_id);
  if (options.status) qs.set("status", options.status);
  if (options.limit) qs.set("limit", String(options.limit));
  const query = qs.toString();
  return apiFetch<{ rules: NotificationRuleRecord[]; total: number }>(
    `/api/v1/notifications/rules${query ? `?${query}` : ""}`,
  );
}

export async function deleteNotificationRule(ruleId: string): Promise<{ deleted: boolean }> {
  return apiFetch<{ deleted: boolean }>(
    `/api/v1/notifications/rules/${encodeURIComponent(ruleId)}`,
    { method: "DELETE" },
  );
}

export async function fetchProjectNotificationSchema(
  projectId: string,
): Promise<{ schema: ProjectNotificationSchema | null }> {
  return apiFetch<{ schema: ProjectNotificationSchema | null }>(
    `/api/v1/projects/${encodeURIComponent(projectId)}/notifications/schema`,
  );
}

export function resolveNotificationDeepLink(event: NotificationEventRecord): string | null {
  if (event.payload?.deep_link) {
    return event.payload.deep_link;
  }
  if (event.installation_id) {
    return `/app/installed/${event.installation_id}/run`;
  }
  if (event.project_id) {
    return `/app/projects/${event.project_id}/run`;
  }
  return null;
}

export function formatNotificationTime(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  if (diffMs < 60_000) return "Just now";
  if (diffMs < 3_600_000) return `${Math.floor(diffMs / 60_000)}m ago`;
  if (diffMs < 86_400_000) return `${Math.floor(diffMs / 3_600_000)}h ago`;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
