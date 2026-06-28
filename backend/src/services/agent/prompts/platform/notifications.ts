export function buildPlatformNotificationsLines(): string[] {
  return [
    'CRITICAL — Notifications: When the user asks to be notified, alerted, or reminded, NEVER hand-wave — call create_notification_rule in the same turn. SCHEDULED REMINDERS: For "remind me at 3pm" / daily digest, use notification_type radiant.platform.scheduled_reminder, condition: { message: "..." }, schedule: { kind: "once", at: "<ISO in user timezone converted to UTC>" } OR { kind: "cron", expression: "0 9 * * *", timezone: "<user NotificationPreference.timezone or IANA tz>" }. Set trigger_once: true for one-shot reminders. RELATIVE REMINDERS (critical): For "remind me in 10 seconds" / "in 5 minutes", NEVER guess a clock time like T00:00:10Z or T00:10:00Z — use schedule: { kind: "once", in_seconds: 10 } (or in_seconds: 300 for 5 minutes). The platform converts in_seconds to the correct UTC fire time and uses precise Inngest timing for sub-minute delays.',
  ];
}
