import { logger } from "../../shared/logger.js";

export type AgentTransactionMutationAction = "refresh_quote" | "approve" | "reject";

export function auditAgentTransactionMutation(
  action: AgentTransactionMutationAction,
  privyUserId: string,
  transactionId: string,
  correlationId: string,
): void {
  logger.info("agent_transaction_mutation", {
    action,
    privyUserId,
    transactionId,
    correlationId,
    timestamp: new Date().toISOString(),
  });
}
