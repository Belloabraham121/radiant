-- Drop artifact / app-builder tables and related columns

-- Notification tables: drop project/installation scoped columns first
ALTER TABLE "NotificationEvent" DROP COLUMN IF EXISTS "project_id";
ALTER TABLE "NotificationEvent" DROP COLUMN IF EXISTS "installation_id";
ALTER TABLE "NotificationRule" DROP COLUMN IF EXISTS "project_id";
ALTER TABLE "NotificationRule" DROP COLUMN IF EXISTS "installation_id";

DROP INDEX IF EXISTS "NotificationRule_project_id_notification_type_status_idx";
DROP INDEX IF EXISTS "NotificationRule_installation_id_status_idx";

-- ChatMessage: remove app scope column
ALTER TABLE "ChatMessage" DROP COLUMN IF EXISTS "app_scope";

-- Drop artifact-related tables (order respects FK dependencies)
DROP TABLE IF EXISTS "DeployJob";
DROP TABLE IF EXISTS "ArtifactFile";
DROP TABLE IF EXISTS "AppInstallation";
DROP TABLE IF EXISTS "ChatSessionDraftFile";
DROP TABLE IF EXISTS "ChatSessionDraft";
DROP TABLE IF EXISTS "AppData";
DROP TABLE IF EXISTS "Project";

-- Drop enums only used by removed models
DROP TYPE IF EXISTS "DeployJobStatus";
DROP TYPE IF EXISTS "ProjectStatus";

-- NotificationRuleSource: remove 'app' variant if present
-- Postgres cannot drop enum values directly; recreate enum without 'app'
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    WHERE t.typname = 'NotificationRuleSource' AND e.enumlabel = 'app'
  ) THEN
    CREATE TYPE "NotificationRuleSource_new" AS ENUM ('user', 'agent', 'system');
    ALTER TABLE "NotificationRule"
      ALTER COLUMN "source" TYPE "NotificationRuleSource_new"
      USING (
        CASE
          WHEN "source"::text = 'app' THEN 'system'::"NotificationRuleSource_new"
          ELSE "source"::text::"NotificationRuleSource_new"
        END
      );
    DROP TYPE "NotificationRuleSource";
    ALTER TYPE "NotificationRuleSource_new" RENAME TO "NotificationRuleSource";
  END IF;
END $$;
