-- Add stake and governance categories for agent transaction ledger filtering.
ALTER TYPE "AgentTransactionCategory" ADD VALUE IF NOT EXISTS 'stake';
ALTER TYPE "AgentTransactionCategory" ADD VALUE IF NOT EXISTS 'governance';
