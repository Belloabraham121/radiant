-- Persist chat composer @-pinned app scope on user messages for transcript display.
ALTER TABLE "ChatMessage" ADD COLUMN "app_scope" JSONB;
