export type NotificationsConfig = {
  internalApiKey?: string;
};

let cached: NotificationsConfig | undefined;

export function getNotificationsConfig(): NotificationsConfig {
  if (cached) {
    return cached;
  }

  const internalApiKey = process.env.NOTIFICATIONS_INTERNAL_API_KEY?.trim() || undefined;
  cached = { internalApiKey };
  return cached;
}

export function resetNotificationsConfigForTests(): void {
  cached = undefined;
}
