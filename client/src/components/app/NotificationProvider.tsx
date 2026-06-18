"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useNotificationStream } from "@/hooks/useNotificationStream";
import { listNotificationEvents } from "@/lib/notifications-api";
import type { NotificationStreamPayload } from "@/lib/notification-stream";

export type NotificationToastItem = {
  id: string;
  title: string;
  body: string;
  severity?: "info" | "warning" | "critical";
  deepLink?: string | null;
};

type NotificationContextValue = {
  unreadCount: number;
  refreshUnreadCount: () => Promise<void>;
  toasts: NotificationToastItem[];
  dismissToast: (id: string) => void;
};

const NotificationContext = createContext<NotificationContextValue | null>(null);

function resolveStreamDeepLink(event: NotificationStreamPayload): string | null {
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

function playCriticalAlertSound(): void {
  if (typeof window === "undefined") {
    return;
  }
  try {
    const ctx = new AudioContext();
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    oscillator.type = "sine";
    oscillator.frequency.value = 880;
    gain.gain.value = 0.08;
    oscillator.connect(gain);
    gain.connect(ctx.destination);
    oscillator.start();
    oscillator.stop(ctx.currentTime + 0.15);
    void ctx.close();
  } catch {
    // Best-effort — ignore autoplay restrictions.
  }
}

export function NotificationProvider({ children }: { children: ReactNode }) {
  const [unreadCount, setUnreadCount] = useState(0);
  const [toasts, setToasts] = useState<NotificationToastItem[]>([]);

  const refreshUnreadCount = useCallback(async () => {
    try {
      const data = await listNotificationEvents({ unread: true, limit: 1 });
      setUnreadCount(data.total);
    } catch {
      // Ignore when unauthenticated or offline.
    }
  }, []);

  const pushToast = useCallback((event: NotificationStreamPayload) => {
    const severity = event.payload?.severity;
    if (severity === "critical") {
      playCriticalAlertSound();
    }

    const toast: NotificationToastItem = {
      id: event.event_id,
      title: event.title,
      body: event.body,
      severity,
      deepLink: resolveStreamDeepLink(event),
    };

    setToasts((prev) => [toast, ...prev.filter((item) => item.id !== toast.id)].slice(0, 4));

    window.setTimeout(() => {
      setToasts((prev) => prev.filter((item) => item.id !== toast.id));
    }, severity === "critical" ? 12_000 : 8_000);
  }, []);

  useNotificationStream(
    (event) => {
      setUnreadCount((count) => count + 1);
      pushToast(event);
    },
    true,
  );

  useEffect(() => {
    let cancelled = false;
    void listNotificationEvents({ unread: true, limit: 1 })
      .then((data) => {
        if (!cancelled) setUnreadCount(data.total);
      })
      .catch(() => {
        // Ignore when unauthenticated or offline.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const value = useMemo<NotificationContextValue>(
    () => ({
      unreadCount,
      refreshUnreadCount,
      toasts,
      dismissToast: (id) => setToasts((prev) => prev.filter((item) => item.id !== id)),
    }),
    [unreadCount, refreshUnreadCount, toasts],
  );

  return <NotificationContext.Provider value={value}>{children}</NotificationContext.Provider>;
}

export function useNotifications(): NotificationContextValue {
  const ctx = useContext(NotificationContext);
  if (!ctx) {
    throw new Error("useNotifications must be used within NotificationProvider");
  }
  return ctx;
}
