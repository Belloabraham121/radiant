import { getDefaultAgentChainId } from "../../config/chains.js";
import { AppError } from "../../errors/app-error.js";
import { runExecuteTransactionToolWithApproval } from "../agent/execute-transaction-with-approval.js";
import { isExecutePendingUserAction, pendingTransactionFromExecuteOutcome } from "../agent/agent.types.js";
import type { SignAndSendBody, SignAndSendResult } from "./wallet.types.js";

export async function signAndSendForUser(
  privyUserId: string,
  body: SignAndSendBody,
): Promise<SignAndSendResult> {
  const input = {
    chain_id: getDefaultAgentChainId(),
    action: "transfer_native" as const,
    params: {
      recipient: body.recipient,
      amount_mist: body.amount_mist,
    },
  };

  const outcome = await runExecuteTransactionToolWithApproval(privyUserId, input, {
    source: "ui",
  });

  if (isExecutePendingUserAction(outcome)) {
    const pending = pendingTransactionFromExecuteOutcome(outcome);
    throw new AppError(409, "APPROVAL_REQUIRED", "Transaction requires in-app approval", {
      pending_transaction: pending,
      agent_transaction_id: outcome.agent_transaction_id,
      ...(outcome.status === "liquidity_fallback_offered"
        ? { liquidity_fallback_offer: outcome.liquidity_fallback_offer }
        : {}),
    });
  }

  if (outcome.status !== "executed") {
    throw new AppError(500, "INTERNAL_ERROR", "Unexpected execute outcome.");
  }

  const result = outcome.result;
  return {
    digest: result.digest,
    sui_address: result.address,
    effects_status: result.effects_status,
  };
}
