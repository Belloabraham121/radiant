import { logger } from "../../shared/logger.js";

export type AgentTransactionMutationAction =
  | "refresh_quote"
  | "approve"
  | "reject"
  | "accept_liquidity_fallback"
  | "reject_liquidity_fallback"
  | "accept_stellar_routing_fallback"
  | "reject_stellar_routing_fallback";

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
