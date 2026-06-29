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
import { toast } from "sonner";
import {
  notificationToastClassName,
} from "@/components/app/NotificationToaster";
import { useNotificationStream } from "@/hooks/useNotificationStream";
import { listNotificationEvents } from "@/lib/notifications-api";
import type { NotificationStreamPayload } from "@/lib/notification-stream";

type NotificationContextValue = {
  unreadCount: number;
  refreshUnreadCount: () => Promise<void>;
};

const NotificationContext = createContext<NotificationContextValue | null>(null);

function resolveStreamDeepLink(event: NotificationStreamPayload): string | null {
  if (event.payload?.deep_link) {
    return event.payload.deep_link;
  }
  return "/app/chat";
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

    const deepLink = resolveStreamDeepLink(event);

    toast(event.title, {
      id: event.event_id,
      description: event.body,
      duration: severity === "critical" ? 12_000 : 8_000,
      className: notificationToastClassName(severity),
      action: deepLink
        ? {
            label: "Open",
            onClick: () => {
              window.location.assign(deepLink);
            },
          }
        : undefined,
    });
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
    }),
    [unreadCount, refreshUnreadCount],
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
