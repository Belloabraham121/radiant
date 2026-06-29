import type { AppActionParamField } from "../agent/onchain-actions/app-action.types.js";

export const PROJECT_NOTIFICATION_SCHEMA_VERSION = 1 as const;

export const PLATFORM_NOTIFICATION_NAMESPACE = "radiant.platform" as const;

export type NotificationChannel = "in_app" | "web_push" | "email";

/** Persisted per-project notification catalog (parallel to action_schema). */
export type ProjectNotificationSchema = {
  schema_version: typeof PROJECT_NOTIFICATION_SCHEMA_VERSION;
  app_id: string;
  types: NotificationTypeDefinition[];
};

export type NotificationTypeDefinition = {
  /** Slug within this app — full key is `${app_id}.${type}`. */
  type: string;
  label: string;
  description: string;
  trigger_kind: "event" | "poll" | "schedule";
  condition_schema: AppActionParamField[];
  default_channels: NotificationChannel[];
  poll_interval_seconds?: number;
  /** Backend registry key, e.g. "deepbook.flash_loan_scanner". */
  evaluator?: string;
  presentation?: NotificationPresentationTemplate;
};

export type NotificationPresentationTemplate = {
  title_template?: string;
  body_template?: string;
  deep_link_template?: string;
};

/** Stored on NotificationRule.condition — validated against the type's condition_schema. */
export type NotificationRuleCondition = Record<string, unknown>;

/** Stored on NotificationRule.schedule when trigger_kind is schedule. */
export type NotificationSchedule =
  | { kind: "once"; at: string }
  | { kind: "cron"; expression: string; timezone: string }
  | { kind: "interval"; every_seconds: number; until?: string };

/** Stored on NotificationEvent.payload. */
export type NotificationEventPayload = {
  deep_link?: string;
  data?: Record<string, unknown>;
  rule_id?: string;
  group_key?: string;
  severity?: "info" | "warning" | "critical";
};

export type ParsedNotificationTypeKey =
  | {
      scope: "platform";
      notification_type: string;
      platform_type: string;
    }
  | {
      scope: "app";
      notification_type: string;
      app_id: string;
      type: string;
    };

export type NotificationValidationError = {
  code: string;
  message: string;
  path?: string;
};
