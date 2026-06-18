import type { NotificationPreference, NotificationRule } from "@prisma/client";

export type DeliveryPolicySkipReason =
  | "disabled"
  | "paused_rule"
  | "quiet_hours"
  | "rate_limit"
  | "cooldown";

export type DeliveryPolicyEvaluation = {
  allowed: boolean;
  skipReason?: DeliveryPolicySkipReason;
};

function parseTimeToMinutes(value: string): number | null {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value.trim());
  if (!match) {
    return null;
  }
  return Number(match[1]) * 60 + Number(match[2]);
}

function currentMinutesInTimezone(now: Date, timezone: string): number | null {
  try {
    const formatter = new Intl.DateTimeFormat("en-GB", {
      timeZone: timezone,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
    const parts = formatter.formatToParts(now);
    const hour = Number(parts.find((part) => part.type === "hour")?.value ?? "0");
    const minute = Number(parts.find((part) => part.type === "minute")?.value ?? "0");
    return hour * 60 + minute;
  } catch {
    return null;
  }
}

export function isWithinQuietHours(input: {
  now: Date;
  timezone: string;
  quietHoursStart: string | null;
  quietHoursEnd: string | null;
}): boolean {
  const { quietHoursStart, quietHoursEnd } = input;
  if (!quietHoursStart || !quietHoursEnd) {
    return false;
  }

  const startMinutes = parseTimeToMinutes(quietHoursStart);
  const endMinutes = parseTimeToMinutes(quietHoursEnd);
  const currentMinutes = currentMinutesInTimezone(input.now, input.timezone);
  if (startMinutes == null || endMinutes == null || currentMinutes == null) {
    return false;
  }

  if (startMinutes === endMinutes) {
    return false;
  }

  if (startMinutes < endMinutes) {
    return currentMinutes >= startMinutes && currentMinutes < endMinutes;
  }

  return currentMinutes >= startMinutes || currentMinutes < endMinutes;
}

export function isRuleCooldownActive(rule: NotificationRule, now: Date): boolean {
  if (!rule.last_triggered_at) {
    return false;
  }

  const elapsedMs = now.getTime() - rule.last_triggered_at.getTime();
  return elapsedMs < rule.cooldown_seconds * 1000;
}

export function evaluateNotificationDeliveryPolicy(input: {
  now: Date;
  preferences: NotificationPreference;
  rule?: NotificationRule | null;
  eventsInLastHour: number;
}): DeliveryPolicyEvaluation {
  if (!input.preferences.enabled) {
    return { allowed: false, skipReason: "disabled" };
  }

  if (input.rule && input.rule.status !== "active") {
    return { allowed: false, skipReason: "paused_rule" };
  }

  if (
    isWithinQuietHours({
      now: input.now,
      timezone: input.preferences.timezone,
      quietHoursStart: input.preferences.quiet_hours_start,
      quietHoursEnd: input.preferences.quiet_hours_end,
    })
  ) {
    return { allowed: false, skipReason: "quiet_hours" };
  }

  if (input.eventsInLastHour >= input.preferences.max_per_hour) {
    return { allowed: false, skipReason: "rate_limit" };
  }

  if (input.rule && isRuleCooldownActive(input.rule, input.now)) {
    return { allowed: false, skipReason: "cooldown" };
  }

  return { allowed: true };
}
