import { getDefaultAgentChainId } from "../../config/chains.js";
import { AppError } from "../../errors/app-error.js";
import { runExecuteTransactionToolWithApproval } from "../agent/execute-transaction-with-approval.js";
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

  if (outcome.status === "approval_required") {
    throw new AppError(409, "APPROVAL_REQUIRED", "Transaction requires in-app approval", {
      pending_transaction: outcome.pending,
      agent_transaction_id: outcome.agent_transaction_id,
    });
  }

  const result = outcome.result;
  return {
    digest: result.digest,
    sui_address: result.address,
    effects_status: result.effects_status,
  };
}
