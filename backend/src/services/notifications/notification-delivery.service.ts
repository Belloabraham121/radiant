import { Prisma } from "@prisma/client";
import { AppError } from "../../errors/app-error.js";
import { findUserByPrivyId } from "../auth/user.repository.js";
import { evaluateNotificationDeliveryPolicy } from "./notification-delivery-policy.service.js";
import {
  countNotificationEventsSince,
  createNotificationDeliveries,
  createNotificationEvent,
  findNotificationEventByIdempotencyKey,
} from "./notification-event.repository.js";
import { getOrCreateNotificationPreference } from "./notification-preference.repository.js";
import {
  findNotificationRuleById,
  touchNotificationRuleTriggered,
} from "./notification-rule.repository.js";
import type {
  NotificationChannel,
  NotificationEventPayload,
} from "./notification-schema.types.js";
import { emitNotificationStreamEvent } from "./notification-stream.service.js";
import { validateNotificationChannels } from "./notification-schema.service.js";

export type EmitNotificationInput = {
  userId?: bigint;
  privyUserId?: string;
  ruleId?: string;
  notificationType: string;
  title: string;
  body: string;
  payload?: NotificationEventPayload;
  idempotencyKey?: string;
  projectId?: string;
  installationId?: string;
  channels?: NotificationChannel[];
};

export type DeliverNotificationResult =
  | {
      status: "delivered";
      event_id: string;
      skipped_channels: NotificationChannel[];
    }
  | {
      status: "duplicate";
      event_id: string;
    }
  | {
      status: "suppressed";
      reason: string;
      rule_id?: string;
    };

async function resolveUserId(input: {
  userId?: bigint;
  privyUserId?: string;
}): Promise<bigint> {
  if (input.userId !== undefined) {
    return input.userId;
  }

  if (input.privyUserId) {
    const user = await findUserByPrivyId(input.privyUserId);
    if (!user) {
      throw new AppError(404, "USER_NOT_FOUND", "User not found");
    }
    return user.id;
  }

  throw new AppError(400, "INVALID_INPUT", "user_id or privy_user_id is required");
}

function parseChannels(value: unknown): NotificationChannel[] {
  const result = validateNotificationChannels(value);
  if (!result.success) {
    return ["in_app"];
  }
  return result.data;
}

function resolveChannels(input: {
  explicit?: NotificationChannel[];
  ruleChannels?: unknown;
  preferenceChannels: unknown;
}): NotificationChannel[] {
  if (input.explicit?.length) {
    return input.explicit;
  }
  if (input.ruleChannels !== undefined) {
    return parseChannels(input.ruleChannels);
  }
  return parseChannels(input.preferenceChannels);
}

export async function deliverNotification(
  input: EmitNotificationInput,
): Promise<DeliverNotificationResult> {
  if (input.idempotencyKey) {
    const existing = await findNotificationEventByIdempotencyKey(input.idempotencyKey);
    if (existing) {
      return { status: "duplicate", event_id: existing.id };
    }
  }

  const userId = await resolveUserId(input);
  const rule = input.ruleId ? await findNotificationRuleById(input.ruleId) : null;

  if (input.ruleId && !rule) {
    throw new AppError(404, "RULE_NOT_FOUND", "Notification rule not found");
  }

  if (rule && rule.user_id !== userId) {
    throw new AppError(403, "FORBIDDEN", "Rule does not belong to user");
  }

  const preferences = await getOrCreateNotificationPreference(userId);
  const now = new Date();
  const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
  const eventsInLastHour = await countNotificationEventsSince(userId, oneHourAgo);

  const policy = evaluateNotificationDeliveryPolicy({
    now,
    preferences,
    rule,
    eventsInLastHour,
  });

  if (!policy.allowed) {
    return {
      status: "suppressed",
      reason: policy.skipReason ?? "policy_blocked",
      ...(rule ? { rule_id: rule.id } : {}),
    };
  }

  const channels = resolveChannels({
    explicit: input.channels,
    ruleChannels: rule?.channels,
    preferenceChannels: preferences.default_channels,
  });

  const payload: NotificationEventPayload = {
    ...(input.payload ?? {}),
    ...(rule ? { rule_id: rule.id } : {}),
  };

  let event;
  try {
    event = await createNotificationEvent({
      userId,
      ruleId: rule?.id ?? null,
      projectId: input.projectId ?? rule?.project_id ?? null,
      installationId: input.installationId ?? rule?.installation_id ?? null,
      notificationType: input.notificationType,
      title: input.title,
      body: input.body,
      payload,
      idempotencyKey: input.idempotencyKey ?? null,
    });
  } catch (error) {
    if (
      input.idempotencyKey &&
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      const existing = await findNotificationEventByIdempotencyKey(input.idempotencyKey);
      if (existing) {
        return { status: "duplicate", event_id: existing.id };
      }
    }
    throw error;
  }

  const sentAt = now;
  const deliveryRows = channels.map((channel) => {
    if (channel === "in_app") {
      return {
        eventId: event.id,
        channel: "in_app" as const,
        status: "sent" as const,
        sentAt,
      };
    }

    return {
      eventId: event.id,
      channel,
      status: "skipped" as const,
      error: "Channel not enabled in Phase 2",
    };
  });

  await createNotificationDeliveries(deliveryRows);

  if (channels.includes("in_app")) {
    emitNotificationStreamEvent(userId, {
      type: "notification",
      event_id: event.id,
      notification_type: event.notification_type,
      title: event.title,
      body: event.body,
      payload,
      project_id: event.project_id,
      installation_id: event.installation_id,
      rule_id: event.rule_id,
      ts: event.created_at.toISOString(),
    });
  }

  if (rule) {
    await touchNotificationRuleTriggered(rule.id, {
      lastTriggeredAt: now,
      ...(rule.trigger_once ? { status: "expired" } : {}),
    });
  }

  return {
    status: "delivered",
    event_id: event.id,
    skipped_channels: channels.filter((channel) => channel !== "in_app"),
  };
}
