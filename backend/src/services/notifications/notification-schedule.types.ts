import type { NotificationRule } from "@prisma/client";
import type { NotificationTypeDefinition } from "./notification-schema.types.js";

export type ScheduleRuleEvaluationContext = {
  rule: NotificationRule;
  typeDefinition: NotificationTypeDefinition;
  timezone: string;
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
