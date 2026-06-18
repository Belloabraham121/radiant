import type { NotificationRule } from "@prisma/client";
import type { NotificationTypeDefinition } from "./notification-schema.types.js";

export type ScheduleRuleEvaluationContext = {
  rule: NotificationRule;
  typeDefinition: NotificationTypeDefinition;
  /** User NotificationPreference.timezone — used when schedule has no explicit tz (once/interval). */
  timezone: string;
  projectId: string | null;
  installationId: string | null;
};

export type ScheduleEvaluatorRunResult = {
  rules_evaluated: number;
  candidates: number;
  emitted: number;
  suppressed: number;
  duplicates: number;
  errors: number;
  skipped_not_due: number;
};
