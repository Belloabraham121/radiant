export type NotificationsConfig = {
  internalApiKey?: string;
  pollCron: string;
  scheduleCron: string;
};

let cached: NotificationsConfig | undefined;

export function getNotificationsConfig(): NotificationsConfig {
  if (cached) {
    return cached;
  }

  const internalApiKey = process.env.NOTIFICATIONS_INTERNAL_API_KEY?.trim() || undefined;
  const pollCron = process.env.NOTIFICATION_POLL_CRON?.trim() || "*/1 * * * *";
  const scheduleCron = process.env.NOTIFICATION_SCHEDULE_CRON?.trim() || "*/1 * * * *";
  cached = { internalApiKey, pollCron, scheduleCron };
  return cached;
}

export function resetNotificationsConfigForTests(): void {
  cached = undefined;
}
