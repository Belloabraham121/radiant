-- CreateEnum
CREATE TYPE "CanvasBuildMessageRole" AS ENUM ('user', 'assistant');

-- AlterTable
ALTER TABLE "CanvasWorkflow" ADD COLUMN "design_notes" TEXT;

-- CreateTable
CREATE TABLE "CanvasBuildMessage" (
    "id" UUID NOT NULL,
    "workflow_id" UUID NOT NULL,
    "user_id" BIGINT NOT NULL,
    "role" "CanvasBuildMessageRole" NOT NULL,
    "content" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CanvasBuildMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CanvasBuildMessage_workflow_id_created_at_idx" ON "CanvasBuildMessage"("workflow_id", "created_at" ASC);

-- CreateIndex
CREATE INDEX "CanvasBuildMessage_user_id_idx" ON "CanvasBuildMessage"("user_id");

-- AddForeignKey
ALTER TABLE "CanvasBuildMessage" ADD CONSTRAINT "CanvasBuildMessage_workflow_id_fkey" FOREIGN KEY ("workflow_id") REFERENCES "CanvasWorkflow"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CanvasBuildMessage" ADD CONSTRAINT "CanvasBuildMessage_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
