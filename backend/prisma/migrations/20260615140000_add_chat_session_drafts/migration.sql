-- CreateTable
CREATE TABLE "ChatSessionDraft" (
    "id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "tagline" TEXT NOT NULL DEFAULT '',
    "template" TEXT NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChatSessionDraft_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatSessionDraftFile" (
    "id" UUID NOT NULL,
    "draft_id" UUID NOT NULL,
    "path" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "revision" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatSessionDraftFile_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ChatSessionDraft_session_id_key" ON "ChatSessionDraft"("session_id");

-- CreateIndex
CREATE INDEX "ChatSessionDraftFile_draft_id_revision_idx" ON "ChatSessionDraftFile"("draft_id", "revision");

-- CreateIndex
CREATE UNIQUE INDEX "ChatSessionDraftFile_draft_id_path_revision_key" ON "ChatSessionDraftFile"("draft_id", "path", "revision");

-- AddForeignKey
ALTER TABLE "ChatSessionDraft" ADD CONSTRAINT "ChatSessionDraft_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "ChatSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatSessionDraftFile" ADD CONSTRAINT "ChatSessionDraftFile_draft_id_fkey" FOREIGN KEY ("draft_id") REFERENCES "ChatSessionDraft"("id") ON DELETE CASCADE ON UPDATE CASCADE;
