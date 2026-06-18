/* Radiant platform service worker — Web Push only (not used by generated apps). */

self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  let payload = {
    title: "Radiant",
    body: "You have a new notification",
    data: { url: "/app/projects" },
  };

  if (event.data) {
    try {
      payload = { ...payload, ...event.data.json() };
    } catch {
      payload.body = event.data.text();
    }
  }

  const title = payload.title || "Radiant";
  const options = {
    body: payload.body || "",
    data: payload.data || { url: "/app/projects" },
    icon: "/file.svg",
    badge: "/file.svg",
    tag: payload.data?.event_id || "radiant-notification",
    renotify: true,
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const path = event.notification.data?.url || "/app/projects";
  const targetUrl = new URL(path, self.location.origin).href;

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(async (clientList) => {
      for (const client of clientList) {
        if ("focus" in client) {
          await client.focus();
          if ("navigate" in client && typeof client.navigate === "function") {
            return client.navigate(targetUrl);
          }
          return;
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
      return undefined;
    }),
  );
});

async function resubscribePush() {
  const configResponse = await fetch("/api/v1/notifications/push/config", {
    credentials: "include",
  });
  if (!configResponse.ok) {
    return;
  }

  const envelope = await configResponse.json();
  const publicKey = envelope?.data?.public_key;
  if (!publicKey) {
    return;
  }

  const padding = "=".repeat((4 - (publicKey.length % 4)) % 4);
  const base64 = (publicKey + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const key = Uint8Array.from(raw, (char) => char.charCodeAt(0));

  const subscription = await self.registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: key,
  });

  const json = subscription.toJSON();
  if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
    return;
  }

  await fetch("/api/v1/notifications/push/subscribe", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      endpoint: json.endpoint,
      keys: {
        p256dh: json.keys.p256dh,
        auth: json.keys.auth,
      },
    }),
  });
}

self.addEventListener("pushsubscriptionchange", (event) => {
  event.waitUntil(resubscribePush());
});
