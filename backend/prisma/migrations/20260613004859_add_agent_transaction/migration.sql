-- CreateEnum
CREATE TYPE "AgentTransactionStatus" AS ENUM ('pending_approval', 'rejected', 'expired', 'submitted', 'success', 'failure');

-- CreateEnum
CREATE TYPE "AgentTransactionCategory" AS ENUM ('swap', 'transfer', 'deepbook_balance', 'deepbook_order', 'deepbook_cancel', 'deepbook_modify', 'deepbook_settled', 'other');

-- CreateTable
CREATE TABLE "AgentTransaction" (
    "id" UUID NOT NULL,
    "user_id" BIGINT NOT NULL,
    "session_id" UUID,
    "message_id" UUID,
    "workflow_step_index" INTEGER,
    "chain_id" TEXT NOT NULL,
    "wallet_address" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "params" JSONB NOT NULL,
    "category" "AgentTransactionCategory" NOT NULL,
    "title" TEXT NOT NULL,
    "amount_display" TEXT NOT NULL,
    "status" "AgentTransactionStatus" NOT NULL,
    "digest" TEXT,
    "effects_status" TEXT,
    "result" JSONB,
    "error_code" TEXT,
    "error_message" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "submitted_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),

    CONSTRAINT "AgentTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AgentTransaction_user_id_created_at_idx" ON "AgentTransaction"("user_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "AgentTransaction_user_id_status_created_at_idx" ON "AgentTransaction"("user_id", "status", "created_at" DESC);

-- CreateIndex
CREATE INDEX "AgentTransaction_user_id_category_created_at_idx" ON "AgentTransaction"("user_id", "category", "created_at" DESC);

-- CreateIndex
CREATE INDEX "AgentTransaction_session_id_created_at_idx" ON "AgentTransaction"("session_id", "created_at" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "AgentTransaction_digest_key" ON "AgentTransaction"("digest");

-- AddForeignKey
ALTER TABLE "AgentTransaction" ADD CONSTRAINT "AgentTransaction_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentTransaction" ADD CONSTRAINT "AgentTransaction_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "ChatSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentTransaction" ADD CONSTRAINT "AgentTransaction_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "ChatMessage"("id") ON DELETE SET NULL ON UPDATE CASCADE;
