import { apiFetch } from "./api";

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
