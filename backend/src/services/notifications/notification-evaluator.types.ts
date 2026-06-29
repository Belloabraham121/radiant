import type { NotificationRule } from "@prisma/client";
import type {
  NotificationEventPayload,
  NotificationTypeDefinition,
} from "./notification-schema.types.js";

export type PollRuleEvaluationContext = {
  rule: NotificationRule;
  typeDefinition: NotificationTypeDefinition;
  privyUserId: string;
};

export type NotificationEmitCandidate = {
  rule_id: string;
  user_id: bigint;
  notification_type: string;
  title: string;
  body: string;
  payload: NotificationEventPayload;
  idempotency_key: string;
};

export type NotificationEvaluator = {
  key: string;
  evaluate(rules: PollRuleEvaluationContext[]): Promise<NotificationEmitCandidate[]>;
};

export type PollEvaluatorRunResult = {
  evaluator_key: string;
  rules_evaluated: number;
  candidates: number;
  emitted: number;
  suppressed: number;
  duplicates: number;
  errors: number;
};
