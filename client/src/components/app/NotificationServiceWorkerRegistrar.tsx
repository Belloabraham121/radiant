"use client";

import { useEffect } from "react";
import { registerNotificationServiceWorker } from "@/lib/notifications-api";

/** Registers the platform service worker without prompting for notification permission. */
export function NotificationServiceWorkerRegistrar() {
  useEffect(() => {
    void registerNotificationServiceWorker();
  }, []);

  return null;
}
