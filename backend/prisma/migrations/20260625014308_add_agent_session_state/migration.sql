-- CreateTable
CREATE TABLE "AgentSessionState" (
    "session_id" UUID NOT NULL,
    "clarification" JSONB,
    "workflow" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgentSessionState_pkey" PRIMARY KEY ("session_id")
);

-- CreateIndex
CREATE INDEX "AgentSessionState_updated_at_idx" ON "AgentSessionState"("updated_at");

-- AddForeignKey
ALTER TABLE "AgentSessionState" ADD CONSTRAINT "AgentSessionState_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "ChatSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
