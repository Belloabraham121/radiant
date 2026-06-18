import type { NotificationChannel } from "./notification-schema.types.js";
import {
  getOrCreateNotificationPreference,
  updateNotificationPreference,
} from "./notification-preference.repository.js";
import { validateNotificationChannels } from "./notification-schema.service.js";
import { AppError } from "../../errors/app-error.js";
import { findUserByPrivyId } from "../auth/user.repository.js";
import { toNotificationJsonValue } from "./notification-json.js";

export type NotificationPreferenceRecord = {
  enabled: boolean;
  timezone: string;
  quiet_hours_start: string | null;
  quiet_hours_end: string | null;
  max_per_hour: number;
  default_channels: NotificationChannel[];
  updated_at: string;
};

export type PatchNotificationPreferenceInput = {
  enabled?: boolean;
  timezone?: string;
  quiet_hours_start?: string | null;
  quiet_hours_end?: string | null;
  max_per_hour?: number;
  default_channels?: NotificationChannel[];
};

const TIME_OF_DAY_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

function toPreferenceRecord(row: {
  enabled: boolean;
  timezone: string;
  quiet_hours_start: string | null;
  quiet_hours_end: string | null;
  max_per_hour: number;
  default_channels: unknown;
  updated_at: Date;
}): NotificationPreferenceRecord {
  return {
    enabled: row.enabled,
    timezone: row.timezone,
    quiet_hours_start: row.quiet_hours_start,
    quiet_hours_end: row.quiet_hours_end,
    max_per_hour: row.max_per_hour,
    default_channels: row.default_channels as NotificationChannel[],
    updated_at: row.updated_at.toISOString(),
  };
}

function assertTimeOfDay(value: string | null | undefined, field: string): void {
  if (value == null) {
    return;
  }
  if (!TIME_OF_DAY_RE.test(value)) {
    throw new AppError(400, "INVALID_TIME", `${field} must be HH:MM (24-hour)`);
  }
}

export async function getNotificationPreferencesForUser(
  privyUserId: string,
): Promise<NotificationPreferenceRecord> {
  const user = await findUserByPrivyId(privyUserId);
  if (!user) {
    throw new AppError(404, "USER_NOT_FOUND", "User not found");
  }

  const row = await getOrCreateNotificationPreference(user.id);
  return toPreferenceRecord(row);
}

export async function patchNotificationPreferencesForUser(
  privyUserId: string,
  input: PatchNotificationPreferenceInput,
): Promise<NotificationPreferenceRecord> {
  const user = await findUserByPrivyId(privyUserId);
  if (!user) {
    throw new AppError(404, "USER_NOT_FOUND", "User not found");
  }

  assertTimeOfDay(input.quiet_hours_start, "quiet_hours_start");
  assertTimeOfDay(input.quiet_hours_end, "quiet_hours_end");

  if (input.max_per_hour !== undefined && (input.max_per_hour < 1 || input.max_per_hour > 1000)) {
    throw new AppError(400, "INVALID_MAX_PER_HOUR", "max_per_hour must be between 1 and 1000");
  }

  if (input.default_channels !== undefined) {
    const channelsResult = validateNotificationChannels(input.default_channels);
    if (!channelsResult.success) {
      throw new AppError(
        400,
        "INVALID_CHANNELS",
        channelsResult.errors.map((error) => error.message).join("; "),
        { errors: channelsResult.errors },
      );
    }
  }

  const row = await updateNotificationPreference(user.id, {
    enabled: input.enabled,
    timezone: input.timezone,
    quietHoursStart: input.quiet_hours_start,
    quietHoursEnd: input.quiet_hours_end,
    maxPerHour: input.max_per_hour,
    defaultChannels:
      input.default_channels !== undefined
        ? toNotificationJsonValue(input.default_channels)
        : undefined,
  });

  return toPreferenceRecord(row);
}
