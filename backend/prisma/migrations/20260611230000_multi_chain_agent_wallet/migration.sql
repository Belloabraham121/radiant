-- Phase 7.3: multi-chain agent wallets (one wallet per chain per user)

-- Add new columns
ALTER TABLE "AgentWallet" ADD COLUMN "chain_type" TEXT;
ALTER TABLE "AgentWallet" ADD COLUMN "address" TEXT;

-- Backfill existing Sui rows
UPDATE "AgentWallet"
SET "chain_type" = 'sui', "address" = "sui_address"
WHERE "chain_type" IS NULL;

ALTER TABLE "AgentWallet" ALTER COLUMN "chain_type" SET NOT NULL;
ALTER TABLE "AgentWallet" ALTER COLUMN "address" SET NOT NULL;

-- Drop legacy Sui-only column and constraints
DROP INDEX IF EXISTS "AgentWallet_sui_address_key";
DROP INDEX IF EXISTS "AgentWallet_user_id_key";
ALTER TABLE "AgentWallet" DROP COLUMN "sui_address";

-- Multi-chain uniqueness
CREATE UNIQUE INDEX "AgentWallet_user_id_chain_type_key" ON "AgentWallet"("user_id", "chain_type");
CREATE UNIQUE INDEX "AgentWallet_chain_type_address_key" ON "AgentWallet"("chain_type", "address");
