import type { NotificationRule } from "@prisma/client";
import type {
  NotificationEventPayload,
  NotificationTypeDefinition,
} from "./notification-schema.types.js";

/** Active poll rule plus resolved schema metadata for evaluator plugins. */
export type PollRuleEvaluationContext = {
  rule: NotificationRule;
  typeDefinition: NotificationTypeDefinition;
  privyUserId: string;
  projectId: string | null;
  installationId: string | null;
};

/** Match produced by an evaluator — fed into the shared delivery pipeline. */
export type NotificationEmitCandidate = {
  rule_id: string;
  user_id: bigint;
  notification_type: string;
  title: string;
  body: string;
  payload: NotificationEventPayload;
  idempotency_key: string;
  project_id?: string | null;
  installation_id?: string | null;
};

export type NotificationEvaluator = {
  /** Registry key — must match NotificationTypeDefinition.evaluator in app schemas. */
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
