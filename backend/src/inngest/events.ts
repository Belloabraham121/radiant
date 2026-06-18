/** Deploy pipeline job queued from POST /api/v1/deploy. */
export const DEPLOY_REQUESTED_EVENT = "radiant/deploy.requested" as const;

export type DeployRequestedEvent = {
  name: typeof DEPLOY_REQUESTED_EVENT;
  data: {
    jobId: string;
  };
};

/** Notification delivery job queued from internal emit. */
export const NOTIFICATION_EMIT_EVENT = "radiant/notification.emit" as const;

export type NotificationEmitEvent = {
  name: typeof NOTIFICATION_EMIT_EVENT;
  data: {
    userId?: string;
    privyUserId?: string;
    ruleId?: string;
    notificationType: string;
    title: string;
    body: string;
    payload?: Record<string, unknown>;
    idempotencyKey?: string;
    projectId?: string;
    installationId?: string;
    channels?: Array<"in_app" | "web_push" | "email">;
  };
};
