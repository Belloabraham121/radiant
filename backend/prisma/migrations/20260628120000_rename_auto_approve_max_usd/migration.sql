-- Rename SUI-centric auto-approve threshold to unified USD threshold.
-- Existing values (e.g. 25) map 1:1 to USD for migration simplicity.
ALTER TABLE "User" RENAME COLUMN "agent_auto_approve_max_sui" TO "agent_auto_approve_max_usd";

COMMENT ON COLUMN "User"."agent_auto_approve_max_usd" IS 'Max USD notional for auto-approved swaps/transfers.';
