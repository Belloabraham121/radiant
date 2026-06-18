import {
  PLATFORM_NOTIFICATION_NAMESPACE,
  type NotificationTypeDefinition,
} from "./notification-schema.types.js";

/** Server-only platform notification types (not stored on Project.notification_schema). */
const PLATFORM_NOTIFICATION_TYPES: NotificationTypeDefinition[] = [
  {
    type: "scheduled_reminder",
    label: "Scheduled reminder",
    description: "One-time or recurring reminder at a set time",
    trigger_kind: "schedule",
    condition_schema: [
      {
        name: "message",
        type: "string",
        required: true,
        description: "Reminder text shown in the notification",
      },
    ],
    default_channels: ["in_app", "web_push"],
    presentation: {
      title_template: "{{label}}",
      body_template: "{{message}}",
    },
  },
  {
    type: "agent_message",
    label: "Agent message",
    description: "Notification when the agent sends an important update in chat",
    trigger_kind: "event",
    condition_schema: [
      {
        name: "session_id",
        type: "string",
        description: "Limit to a specific chat session",
      },
    ],
    default_channels: ["in_app", "web_push"],
  },
  {
    type: "system_announcement",
    label: "System announcement",
    description: "Platform-wide announcements from Radiant",
    trigger_kind: "event",
    condition_schema: [],
    default_channels: ["in_app"],
  },
];

function platformNotificationTypeKey(typeSlug: string): string {
  return `${PLATFORM_NOTIFICATION_NAMESPACE}.${typeSlug}`;
}

export function listPlatformNotificationTypes(): NotificationTypeDefinition[] {
  return PLATFORM_NOTIFICATION_TYPES.map((entry) => ({ ...entry }));
}

export function getPlatformNotificationType(
  notificationType: string,
): NotificationTypeDefinition | null {
  if (!notificationType.startsWith(`${PLATFORM_NOTIFICATION_NAMESPACE}.`)) {
    return null;
  }

  const typeSlug = notificationType.slice(PLATFORM_NOTIFICATION_NAMESPACE.length + 1);
  const definition = PLATFORM_NOTIFICATION_TYPES.find((entry) => entry.type === typeSlug);
  return definition ? { ...definition } : null;
}

export function isPlatformNotificationType(notificationType: string): boolean {
  return getPlatformNotificationType(notificationType) != null;
}

export function formatPlatformNotificationType(typeSlug: string): string {
  return platformNotificationTypeKey(typeSlug);
}
