-- AlterTable
ALTER TABLE "User"
  ADD COLUMN "agent_allow_governance" BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN "User"."agent_allow_governance" IS 'When true, agent may submit DeepBook governance proposals and vote (always require approval).';
