import { AppError } from "../../errors/app-error.js";
import { buildExplorerTxUrl } from "../agent-transaction/explorer-url.js";
import type { TxResult } from "../chains/types.js";
import type { ApprovalResult } from "../agent/transaction-approval.service.js";
import {
  approvePendingTransaction,
  refreshPendingTransactionQuote,
  rejectPendingTransaction,
} from "../agent/transaction-approval.service.js";

export type AgentTransactionApprovalApiResult =
  | {
      status: "executed";
      agent_transaction_id: string;
      digest: string;
      explorer_url: string | null;
      result: TxResult;
    }
  | {
      status: "error";
      agent_transaction_id: string;
      error: {
        code: string;
        message: string;
        details?: unknown;
      };
    };

export type AgentTransactionRejectApiResult = {
  status: "rejected";
  agent_transaction_id: string;
};

export function mapApprovalOutcomeToApiResult(
  transactionId: string,
  outcome: ApprovalResult,
): AgentTransactionApprovalApiResult {
  if (outcome.ok) {
    return {
      status: "executed",
      agent_transaction_id: transactionId,
      digest: outcome.result.digest,
      explorer_url: buildExplorerTxUrl(outcome.result.chain_id, outcome.result.digest),
      result: outcome.result,
    };
  }

  return {
    status: "error",
    agent_transaction_id: transactionId,
    error: {
      code: outcome.error.code,
      message: outcome.error.message,
      ...(outcome.error.details !== undefined ? { details: outcome.error.details } : {}),
    },
  };
}

/** Approve a pending agent transaction (UI / app action path — no chat session required). */
export async function approveAgentTransactionForUi(
  privyUserId: string,
  transactionId: string,
): Promise<AgentTransactionApprovalApiResult> {
  const outcome = await approvePendingTransaction(privyUserId, transactionId);

  if (!outcome) {
    throw new AppError(
      404,
      "APPROVAL_NOT_FOUND",
      "Transaction approval expired or was not found.",
    );
  }

  return mapApprovalOutcomeToApiResult(transactionId, outcome);
}

export type AgentTransactionRefreshQuoteApiResult = {
  status: "refreshed";
  agent_transaction_id: string;
  pending: import("../agent/agent.types.js").PendingTransaction;
};

/** Re-quote a pending approval without executing (fresh rate for the same dialog). */
export async function refreshAgentTransactionQuoteForUi(
  privyUserId: string,
  transactionId: string,
): Promise<AgentTransactionRefreshQuoteApiResult> {
  const pending = await refreshPendingTransactionQuote(privyUserId, transactionId);

  if (!pending) {
    throw new AppError(
      404,
      "APPROVAL_NOT_FOUND",
      "Transaction approval expired or was not found.",
    );
  }

  return {
    status: "refreshed",
    agent_transaction_id: transactionId,
    pending,
  };
}

/** Reject a pending agent transaction (UI / app action path — no chat session required). */
export async function rejectAgentTransactionForUi(
  privyUserId: string,
  transactionId: string,
): Promise<AgentTransactionRejectApiResult> {
  const rejected = await rejectPendingTransaction(privyUserId, transactionId);

  if (!rejected) {
    throw new AppError(
      404,
      "APPROVAL_NOT_FOUND",
      "Transaction approval expired or was not found.",
    );
  }

  return {
    status: "rejected",
    agent_transaction_id: transactionId,
  };
}
