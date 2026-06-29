-- CreateEnum
CREATE TYPE "CanvasWorkflowStatus" AS ENUM ('draft', 'dry_run_ready', 'live', 'paused', 'archived');

-- CreateEnum
CREATE TYPE "CanvasWorkflowRunMode" AS ENUM ('dry', 'live');

-- CreateEnum
CREATE TYPE "CanvasWorkflowRunStatus" AS ENUM ('running', 'completed', 'failed', 'paused', 'cancelled');

-- CreateEnum
CREATE TYPE "CanvasWorkflowRuntimeStatus" AS ENUM ('active', 'stopped');

-- CreateTable
CREATE TABLE "CanvasWorkflow" (
    "id" UUID NOT NULL,
    "user_id" BIGINT NOT NULL,
    "name" TEXT NOT NULL DEFAULT 'Untitled workflow',
    "status" "CanvasWorkflowStatus" NOT NULL DEFAULT 'draft',
    "schema_version" TEXT NOT NULL DEFAULT '1.0.0',
    "revision" INTEGER NOT NULL DEFAULT 0,
    "graph" JSONB NOT NULL DEFAULT '{"nodes":[],"edges":[]}',
    "build_config" JSONB,
    "tester_config" JSONB,
    "policy_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CanvasWorkflow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CanvasWorkflowPolicy" (
    "id" UUID NOT NULL,
    "workflow_id" UUID NOT NULL,
    "policy_version" TEXT NOT NULL DEFAULT '1.0.0',
    "policy" JSONB NOT NULL DEFAULT '{}',
    "kill_switch" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CanvasWorkflowPolicy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CanvasWorkflowRevision" (
    "id" UUID NOT NULL,
    "workflow_id" UUID NOT NULL,
    "revision" INTEGER NOT NULL,
    "graph" JSONB NOT NULL,
    "build_config" JSONB,
    "tester_config" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CanvasWorkflowRevision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CanvasWorkflowRuntime" (
    "id" UUID NOT NULL,
    "workflow_id" UUID NOT NULL,
    "compiled_hash" TEXT,
    "compiled_bundle" JSONB,
    "worker_id" TEXT,
    "status" "CanvasWorkflowRuntimeStatus" NOT NULL DEFAULT 'stopped',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CanvasWorkflowRuntime_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CanvasWorkflowRun" (
    "id" UUID NOT NULL,
    "workflow_id" UUID NOT NULL,
    "user_id" BIGINT NOT NULL,
    "mode" "CanvasWorkflowRunMode" NOT NULL,
    "status" "CanvasWorkflowRunStatus" NOT NULL,
    "workflow_revision" INTEGER NOT NULL,
    "started_at" TIMESTAMP(3) NOT NULL,
    "finished_at" TIMESTAMP(3),
    "error_message" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CanvasWorkflowRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CanvasWorkflowRunEvent" (
    "id" UUID NOT NULL,
    "run_id" UUID NOT NULL,
    "event_type" TEXT NOT NULL,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CanvasWorkflowRunEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CanvasWorkflow_policy_id_key" ON "CanvasWorkflow"("policy_id");

-- CreateIndex
CREATE INDEX "CanvasWorkflow_user_id_updated_at_idx" ON "CanvasWorkflow"("user_id", "updated_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "CanvasWorkflowPolicy_workflow_id_key" ON "CanvasWorkflowPolicy"("workflow_id");

-- CreateIndex
CREATE UNIQUE INDEX "CanvasWorkflowRevision_workflow_id_revision_key" ON "CanvasWorkflowRevision"("workflow_id", "revision");

-- CreateIndex
CREATE UNIQUE INDEX "CanvasWorkflowRuntime_workflow_id_key" ON "CanvasWorkflowRuntime"("workflow_id");

-- CreateIndex
CREATE INDEX "CanvasWorkflowRun_workflow_id_idx" ON "CanvasWorkflowRun"("workflow_id");

-- CreateIndex
CREATE INDEX "CanvasWorkflowRun_user_id_idx" ON "CanvasWorkflowRun"("user_id");

-- CreateIndex
CREATE INDEX "CanvasWorkflowRunEvent_run_id_created_at_idx" ON "CanvasWorkflowRunEvent"("run_id", "created_at" ASC);

-- AddForeignKey
ALTER TABLE "CanvasWorkflow" ADD CONSTRAINT "CanvasWorkflow_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CanvasWorkflowPolicy" ADD CONSTRAINT "CanvasWorkflowPolicy_workflow_id_fkey" FOREIGN KEY ("workflow_id") REFERENCES "CanvasWorkflow"("id") ON DELETE CASCADE ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED;

-- AddForeignKey
ALTER TABLE "CanvasWorkflow" ADD CONSTRAINT "CanvasWorkflow_policy_id_fkey" FOREIGN KEY ("policy_id") REFERENCES "CanvasWorkflowPolicy"("id") ON DELETE RESTRICT ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED;

-- AddForeignKey
ALTER TABLE "CanvasWorkflowRevision" ADD CONSTRAINT "CanvasWorkflowRevision_workflow_id_fkey" FOREIGN KEY ("workflow_id") REFERENCES "CanvasWorkflow"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CanvasWorkflowRuntime" ADD CONSTRAINT "CanvasWorkflowRuntime_workflow_id_fkey" FOREIGN KEY ("workflow_id") REFERENCES "CanvasWorkflow"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CanvasWorkflowRun" ADD CONSTRAINT "CanvasWorkflowRun_workflow_id_fkey" FOREIGN KEY ("workflow_id") REFERENCES "CanvasWorkflow"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CanvasWorkflowRun" ADD CONSTRAINT "CanvasWorkflowRun_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CanvasWorkflowRunEvent" ADD CONSTRAINT "CanvasWorkflowRunEvent_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "CanvasWorkflowRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
