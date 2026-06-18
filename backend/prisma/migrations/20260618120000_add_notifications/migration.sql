-- CreateEnum
CREATE TYPE "NotificationChannelType" AS ENUM ('in_app', 'web_push', 'email');

-- CreateEnum
CREATE TYPE "NotificationRuleStatus" AS ENUM ('active', 'paused', 'expired', 'deleted');

-- CreateEnum
CREATE TYPE "NotificationRuleSource" AS ENUM ('user', 'agent', 'app', 'system');

-- CreateEnum
CREATE TYPE "NotificationTriggerKind" AS ENUM ('event', 'poll', 'schedule');

-- CreateEnum
CREATE TYPE "NotificationDeliveryStatus" AS ENUM ('pending', 'sent', 'failed', 'skipped', 'read');

-- AlterTable
ALTER TABLE "Project" ADD COLUMN "notification_schema" JSONB;

-- CreateTable
CREATE TABLE "NotificationPushSubscription" (
    "id" UUID NOT NULL,
    "user_id" BIGINT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "user_agent" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_used_at" TIMESTAMP(3),
    "revoked_at" TIMESTAMP(3),

    CONSTRAINT "NotificationPushSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationPreference" (
    "user_id" BIGINT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "quiet_hours_start" VARCHAR(5),
    "quiet_hours_end" VARCHAR(5),
    "max_per_hour" INTEGER NOT NULL DEFAULT 10,
    "default_channels" JSONB NOT NULL DEFAULT '["in_app","web_push"]',
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NotificationPreference_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "NotificationRule" (
    "id" UUID NOT NULL,
    "user_id" BIGINT NOT NULL,
    "project_id" UUID,
    "installation_id" UUID,
    "source" "NotificationRuleSource" NOT NULL,
    "session_id" UUID,
    "label" VARCHAR(120),
    "notification_type" VARCHAR(120) NOT NULL,
    "trigger_kind" "NotificationTriggerKind" NOT NULL,
    "condition" JSONB NOT NULL DEFAULT '{}',
    "schedule" JSONB,
    "channels" JSONB NOT NULL DEFAULT '["in_app","web_push"]',
    "status" "NotificationRuleStatus" NOT NULL DEFAULT 'active',
    "cooldown_seconds" INTEGER NOT NULL DEFAULT 300,
    "trigger_once" BOOLEAN NOT NULL DEFAULT false,
    "last_triggered_at" TIMESTAMP(3),
    "expires_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NotificationRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationEvent" (
    "id" UUID NOT NULL,
    "user_id" BIGINT NOT NULL,
    "rule_id" UUID,
    "project_id" UUID,
    "installation_id" UUID,
    "notification_type" VARCHAR(120) NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "idempotency_key" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NotificationEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationDelivery" (
    "id" UUID NOT NULL,
    "event_id" UUID NOT NULL,
    "channel" "NotificationChannelType" NOT NULL,
    "status" "NotificationDeliveryStatus" NOT NULL DEFAULT 'pending',
    "error" TEXT,
    "external_ref" TEXT,
    "sent_at" TIMESTAMP(3),
    "read_at" TIMESTAMP(3),

    CONSTRAINT "NotificationDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "NotificationPushSubscription_endpoint_key" ON "NotificationPushSubscription"("endpoint");

-- CreateIndex
CREATE INDEX "NotificationPushSubscription_user_id_idx" ON "NotificationPushSubscription"("user_id");

-- CreateIndex
CREATE INDEX "NotificationRule_user_id_status_idx" ON "NotificationRule"("user_id", "status");

-- CreateIndex
CREATE INDEX "NotificationRule_project_id_notification_type_status_idx" ON "NotificationRule"("project_id", "notification_type", "status");

-- CreateIndex
CREATE INDEX "NotificationRule_installation_id_status_idx" ON "NotificationRule"("installation_id", "status");

-- CreateIndex
CREATE INDEX "NotificationRule_notification_type_status_trigger_kind_idx" ON "NotificationRule"("notification_type", "status", "trigger_kind");

-- CreateIndex
CREATE UNIQUE INDEX "NotificationEvent_idempotency_key_key" ON "NotificationEvent"("idempotency_key");

-- CreateIndex
CREATE INDEX "NotificationEvent_user_id_created_at_idx" ON "NotificationEvent"("user_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "NotificationEvent_rule_id_idx" ON "NotificationEvent"("rule_id");

-- CreateIndex
CREATE INDEX "NotificationDelivery_event_id_idx" ON "NotificationDelivery"("event_id");

-- CreateIndex
CREATE INDEX "NotificationDelivery_status_channel_idx" ON "NotificationDelivery"("status", "channel");

-- AddForeignKey
ALTER TABLE "NotificationPushSubscription" ADD CONSTRAINT "NotificationPushSubscription_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationPreference" ADD CONSTRAINT "NotificationPreference_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationRule" ADD CONSTRAINT "NotificationRule_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationEvent" ADD CONSTRAINT "NotificationEvent_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationEvent" ADD CONSTRAINT "NotificationEvent_rule_id_fkey" FOREIGN KEY ("rule_id") REFERENCES "NotificationRule"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationDelivery" ADD CONSTRAINT "NotificationDelivery_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "NotificationEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
