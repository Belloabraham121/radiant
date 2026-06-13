-- Allow per-user opt-in for DeepBook flash loans (always require in-app approval).
ALTER TABLE "User"
  ADD COLUMN "agent_allow_flash_loans" BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN "User"."agent_allow_flash_loans" IS 'When true, agent may initiate DeepBook flash loan transactions (always require approval).';
