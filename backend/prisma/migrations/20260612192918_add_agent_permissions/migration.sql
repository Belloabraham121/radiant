-- Agent transaction approval preferences (per user).
ALTER TABLE "User"
  ADD COLUMN "agent_auto_approve_enabled" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "agent_auto_approve_max_sui" DOUBLE PRECISION NOT NULL DEFAULT 25;

COMMENT ON COLUMN "User"."agent_auto_approve_enabled" IS 'When false, every swap and transfer requires in-app approval.';
COMMENT ON COLUMN "User"."agent_auto_approve_max_sui" IS 'Max SUI notional for auto-approved swaps/transfers (display units).';
