"use client";

import { useCallback, useState } from "react";
import type { PendingTransaction } from "@/lib/chat-api";
import {
  approveAgentTransaction,
  rejectAgentTransaction,
} from "@/lib/agent-transactions-api";
import { ApiError } from "@/lib/api";
import type { AppActionResult } from "@/lib/app-actions-api";
import { isAppActionApprovalRequired } from "@/lib/app-actions-api";

export function useAgentTransactionApproval(options?: {
  onExecuted?: (result: Extract<AppActionResult, { status: "executed" }>) => void;
  onRejected?: () => void;
}) {
  const [pending, setPending] = useState<PendingTransaction | null>(null);
  const [approving, setApproving] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const clearPending = useCallback(() => {
    setPending(null);
    setError(null);
    setSuccessMessage(null);
  }, []);

  const handleActionResult = useCallback((result: AppActionResult | null) => {
    if (!result) return;

    if (isAppActionApprovalRequired(result)) {
      setPending(result.pending);
      setError(null);
      setSuccessMessage(null);
      return;
    }

    if (result.status === "executed") {
      setPending(null);
      setError(null);
      setSuccessMessage("Transaction submitted.");
      options?.onExecuted?.(result);
      return;
    }

    if (result.status === "error") {
      setError(result.error.message);
    }
  }, [options]);

  const approve = useCallback(async () => {
    if (!pending || approving || rejecting) return;

    setApproving(true);
    setError(null);

    try {
      const result = await approveAgentTransaction(pending.id);

      if (result.status === "executed") {
        setPending(null);
        const explorerNote = result.explorer_url ? " View on explorer." : "";
        setSuccessMessage(`Transaction submitted.${explorerNote}`);
        options?.onExecuted?.({
          status: "executed",
          digest: result.digest,
          explorer_url: result.explorer_url,
          result: result.result,
          agent_transaction_id: result.agent_transaction_id,
        });
        return;
      }

      setError(result.error.message);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Approval failed. Try again.");
    } finally {
      setApproving(false);
    }
  }, [approving, options, pending, rejecting]);

  const reject = useCallback(async () => {
    if (!pending || approving || rejecting) return;

    setRejecting(true);
    setError(null);

    try {
      await rejectAgentTransaction(pending.id);
      setPending(null);
      setSuccessMessage(null);
      options?.onRejected?.();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not cancel the transaction.");
    } finally {
      setRejecting(false);
    }
  }, [approving, options, pending, rejecting]);

  return {
    pending,
    approving,
    rejecting,
    error,
    successMessage,
    approve,
    reject,
    clearPending,
    handleActionResult,
  };
}
