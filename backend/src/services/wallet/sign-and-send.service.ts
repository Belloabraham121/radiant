import { getDefaultAgentChainId } from "../../config/chains.js";
import { executeTransactionForUser } from "../chains/execute-transaction.js";
import type { SignAndSendBody, SignAndSendResult } from "./wallet.types.js";

function toChainAction(body: SignAndSendBody): { action: string; params: Record<string, unknown> } {
  if (body.action === "transfer_sui") {
    return {
      action: "transfer_native",
      params: {
        recipient: body.recipient,
        amount_mist: body.amount_mist,
      },
    };
  }

  return {
    action: "execute_bytes",
    params: {
      transaction_bytes: body.transaction_bytes,
    },
  };
}

export async function signAndSendForUser(
  privyUserId: string,
  body: SignAndSendBody,
): Promise<SignAndSendResult> {
  const { action, params } = toChainAction(body);
  const result = await executeTransactionForUser(privyUserId, {
    chain_id: getDefaultAgentChainId(),
    action,
    params,
  });

  return {
    digest: result.digest,
    sui_address: result.address,
    effects_status: result.effects_status,
  };
}
