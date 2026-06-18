import type { NotificationRule } from "@prisma/client";
import type { NotificationTypeDefinition } from "./notification-schema.types.js";

export type EventRuleEvaluationContext = {
  rule: NotificationRule;
  typeDefinition: NotificationTypeDefinition;
  projectId: string | null;
  installationId: string | null;
};

export type ProcessNotificationEventInput = {
  notificationType: string;
  data: Record<string, unknown>;
  projectId?: string;
  installationId?: string;
  userId?: bigint;
  idempotencyKey?: string;
  title?: string;
  body?: string;
};

export type ProcessNotificationEventResult = {
  notification_type: string;
  rules_evaluated: number;
  rules_matched: number;
  emitted: number;
  suppressed: number;
  duplicates: number;
  errors: number;
};
