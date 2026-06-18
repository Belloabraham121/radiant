import type { NotificationPreference, Prisma } from "@prisma/client";
import { prisma } from "../../infrastructure/postgres/client.js";
import { toNotificationJsonValue } from "./notification-json.js";

export type UpdateNotificationPreferenceInput = {
  enabled?: boolean;
  timezone?: string;
  quietHoursStart?: string | null;
  quietHoursEnd?: string | null;
  maxPerHour?: number;
  defaultChannels?: Prisma.InputJsonValue;
};

export async function findNotificationPreference(
  userId: bigint,
): Promise<NotificationPreference | null> {
  return prisma.notificationPreference.findUnique({
    where: { user_id: userId },
  });
}

export async function getOrCreateNotificationPreference(
  userId: bigint,
): Promise<NotificationPreference> {
  const existing = await findNotificationPreference(userId);
  if (existing) {
    return existing;
  }

  return prisma.notificationPreference.create({
    data: { user_id: userId },
  });
}

export async function updateNotificationPreference(
  userId: bigint,
  input: UpdateNotificationPreferenceInput,
): Promise<NotificationPreference> {
  await getOrCreateNotificationPreference(userId);

  return prisma.notificationPreference.update({
    where: { user_id: userId },
    data: {
      ...(input.enabled !== undefined ? { enabled: input.enabled } : {}),
      ...(input.timezone !== undefined ? { timezone: input.timezone } : {}),
      ...(input.quietHoursStart !== undefined
        ? { quiet_hours_start: input.quietHoursStart }
        : {}),
      ...(input.quietHoursEnd !== undefined ? { quiet_hours_end: input.quietHoursEnd } : {}),
      ...(input.maxPerHour !== undefined ? { max_per_hour: input.maxPerHour } : {}),
      ...(input.defaultChannels !== undefined
        ? { default_channels: toNotificationJsonValue(input.defaultChannels) }
        : {}),
    },
  });
}
