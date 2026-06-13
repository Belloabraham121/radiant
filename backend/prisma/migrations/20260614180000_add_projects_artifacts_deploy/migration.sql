-- CreateEnum
CREATE TYPE "ProjectStatus" AS ENUM ('draft', 'building', 'deploying', 'live', 'failed');

-- CreateEnum
CREATE TYPE "DeployJobStatus" AS ENUM ('queued', 'running', 'completed', 'failed', 'cancelled');

-- CreateTable
CREATE TABLE "Project" (
    "id" UUID NOT NULL,
    "user_id" BIGINT NOT NULL,
    "session_id" UUID,
    "name" TEXT NOT NULL,
    "tagline" TEXT NOT NULL DEFAULT '',
    "template" TEXT NOT NULL,
    "status" "ProjectStatus" NOT NULL DEFAULT 'draft',
    "accent" TEXT NOT NULL DEFAULT '#8e5bff',
    "template_params" JSONB NOT NULL DEFAULT '{}',
    "package_id" TEXT,
    "walrus_url" TEXT,
    "walrus_blob_id" TEXT,
    "registry_object_id" TEXT,
    "is_public" BOOLEAN NOT NULL DEFAULT false,
    "fee_bps" INTEGER NOT NULL DEFAULT 0,
    "category" TEXT NOT NULL DEFAULT 'payments',
    "artifact_revision" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ArtifactFile" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "path" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "revision" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ArtifactFile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeployJob" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "status" "DeployJobStatus" NOT NULL DEFAULT 'queued',
    "provider" TEXT NOT NULL,
    "sandbox_id" TEXT,
    "sandbox_seconds" INTEGER,
    "estimated_cost_usd" DECIMAL(10,6),
    "logs" TEXT NOT NULL DEFAULT '',
    "error_message" TEXT,
    "artifact_revision" INTEGER NOT NULL,
    "started_at" TIMESTAMP(3),
    "finished_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeployJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Project_user_id_updated_at_idx" ON "Project"("user_id", "updated_at" DESC);

-- CreateIndex
CREATE INDEX "Project_is_public_created_at_idx" ON "Project"("is_public", "created_at" DESC);

-- CreateIndex
CREATE INDEX "ArtifactFile_project_id_revision_idx" ON "ArtifactFile"("project_id", "revision");

-- CreateIndex
CREATE UNIQUE INDEX "ArtifactFile_project_id_path_revision_key" ON "ArtifactFile"("project_id", "path", "revision");

-- CreateIndex
CREATE INDEX "DeployJob_project_id_created_at_idx" ON "DeployJob"("project_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "DeployJob_status_idx" ON "DeployJob"("status");

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "ChatSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArtifactFile" ADD CONSTRAINT "ArtifactFile_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeployJob" ADD CONSTRAINT "DeployJob_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
