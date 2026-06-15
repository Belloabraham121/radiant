-- AlterTable
ALTER TABLE "User" ADD COLUMN     "agent_allow_margin" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "agent_allow_predict" BOOLEAN NOT NULL DEFAULT false;
