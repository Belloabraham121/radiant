-- Profile fields: display name + deterministic Dicebear seed/style.

ALTER TABLE "User" ADD COLUMN "display_name" TEXT;
ALTER TABLE "User" ADD COLUMN "avatar_style" TEXT NOT NULL DEFAULT 'lorelei';
ALTER TABLE "User" ADD COLUMN "avatar_seed" TEXT;

-- Backfill existing users (stable seed from Privy DID).
UPDATE "User" SET "avatar_seed" = "privy_user_id" WHERE "avatar_seed" IS NULL;

ALTER TABLE "User" ALTER COLUMN "avatar_seed" SET NOT NULL;
