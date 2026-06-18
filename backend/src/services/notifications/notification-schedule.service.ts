import { CronExpressionParser } from "cron-parser";
import type { NotificationSchedule } from "./notification-schema.types.js";

const MIN_INTERVAL_SECONDS = 60;
const CRON_TICK_WINDOW_MS = 90_000;
const MAX_ONCE_IN_SECONDS = 86_400;

/** Input shape before normalization — once schedules may use relative in_seconds. */
export type NotificationScheduleInput =
  | { kind: "once"; at?: string; in_seconds?: number }
  | { kind: "cron"; expression: string; timezone: string }
  | { kind: "interval"; every_seconds: number; until?: string };

export function normalizeNotificationScheduleInput(
  schedule: NotificationScheduleInput,
  now = new Date(),
): { ok: true; schedule: NotificationSchedule } | { ok: false; message: string } {
  if (schedule.kind === "once") {
    if (schedule.in_seconds != null) {
      if (!Number.isInteger(schedule.in_seconds) || schedule.in_seconds <= 0) {
        return { ok: false, message: "once.in_seconds must be a positive integer" };
      }
      if (schedule.in_seconds > MAX_ONCE_IN_SECONDS) {
        return {
          ok: false,
          message: `once.in_seconds must be at most ${MAX_ONCE_IN_SECONDS}`,
        };
      }
      return {
        ok: true,
        schedule: {
          kind: "once",
          at: new Date(now.getTime() + schedule.in_seconds * 1000).toISOString(),
        },
      };
    }

    if (!schedule.at) {
      return {
        ok: false,
        message: "once schedule requires at (ISO UTC) or in_seconds (relative delay)",
      };
    }

    if (Number.isNaN(Date.parse(schedule.at))) {
      return { ok: false, message: "once.at must be a valid ISO datetime" };
    }

    return { ok: true, schedule: { kind: "once", at: schedule.at } };
  }

  if (schedule.kind === "cron") {
    return {
      ok: true,
      schedule: {
        kind: "cron",
        expression: schedule.expression,
        timezone: schedule.timezone,
      },
    };
  }

  return {
    ok: true,
    schedule: {
      kind: "interval",
      every_seconds: schedule.every_seconds,
      ...(schedule.until != null ? { until: schedule.until } : {}),
    },
  };
}

export function isValidTimezone(timezone: string): boolean {
  try {
    Intl.DateTimeFormat(undefined, { timeZone: timezone });
    return true;
  } catch {
    return false;
  }
}

export function validateCronScheduleExpression(expression: string, timezone: string): boolean {
  if (!isValidTimezone(timezone)) {
    return false;
  }
  try {
    CronExpressionParser.parse(expression, { tz: timezone });
    return true;
  } catch {
    return false;
  }
}

export function validateScheduleSemantics(
  schedule: NotificationSchedule,
  options?: { now?: Date; requireFutureOnce?: boolean },
): { ok: true } | { ok: false; message: string } {
  if (schedule.kind === "cron") {
    if (!validateCronScheduleExpression(schedule.expression, schedule.timezone)) {
      return { ok: false, message: "Invalid cron expression or timezone" };
    }
    return { ok: true };
  }

  if (schedule.kind === "interval") {
    if (schedule.every_seconds < MIN_INTERVAL_SECONDS) {
      return {
        ok: false,
        message: `interval.every_seconds must be at least ${MIN_INTERVAL_SECONDS}`,
      };
    }
    if (schedule.until && Number.isNaN(Date.parse(schedule.until))) {
      return { ok: false, message: "interval.until must be a valid ISO datetime" };
    }
    return { ok: true };
  }

  if (Number.isNaN(Date.parse(schedule.at))) {
    return { ok: false, message: "once.at must be a valid ISO datetime" };
  }

  if (options?.requireFutureOnce) {
    const now = options.now ?? new Date();
    const at = new Date(schedule.at);
    if (at.getTime() <= now.getTime()) {
      return {
        ok: false,
        message:
          "once.at must be in the future; for relative delays use in_seconds (e.g. remind in 10 seconds → in_seconds: 10)",
      };
    }
  }

  return { ok: true };
}

function formatMinuteBucket(now: Date, timezone: string): string {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  return formatter.format(now).replace(/\D/g, "");
}

export function buildScheduleIdempotencyKey(
  ruleId: string,
  schedule: NotificationSchedule,
  now: Date,
): string {
  switch (schedule.kind) {
    case "once":
      return `schedule:once:${ruleId}`;
    case "interval":
      return `schedule:interval:${ruleId}:${Math.floor(now.getTime() / (schedule.every_seconds * 1000))}`;
    case "cron":
      return `schedule:cron:${ruleId}:${formatMinuteBucket(now, schedule.timezone)}`;
  }
}

export function isScheduleDue(
  schedule: NotificationSchedule,
  input: {
    now: Date;
    lastTriggeredAt: Date | null;
    createdAt: Date;
  },
): boolean {
  if (schedule.kind === "once") {
    if (input.lastTriggeredAt) {
      return false;
    }
    const at = new Date(schedule.at);
    return input.now.getTime() >= at.getTime();
  }

  if (schedule.kind === "interval") {
    if (schedule.until) {
      const until = new Date(schedule.until);
      if (input.now.getTime() > until.getTime()) {
        return false;
      }
    }

    const anchor = input.lastTriggeredAt ?? input.createdAt;
    const elapsedMs = input.now.getTime() - anchor.getTime();
    return elapsedMs >= schedule.every_seconds * 1000;
  }

  try {
    const interval = CronExpressionParser.parse(schedule.expression, {
      currentDate: input.now,
      tz: schedule.timezone,
    });
    const prevFire = interval.prev().toDate();
    if (input.lastTriggeredAt && prevFire.getTime() <= input.lastTriggeredAt.getTime()) {
      return false;
    }
    return input.now.getTime() - prevFire.getTime() <= CRON_TICK_WINDOW_MS;
  } catch {
    return false;
  }
}

export function isOnceScheduleInFuture(schedule: NotificationSchedule, now = new Date()): boolean {
  if (schedule.kind !== "once") {
    return false;
  }
  const at = new Date(schedule.at);
  return !Number.isNaN(at.getTime()) && at.getTime() > now.getTime();
}
