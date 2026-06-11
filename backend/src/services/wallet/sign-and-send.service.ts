import { AppError } from "../../errors/app-error.js";
import { executeSuiTransaction } from "../chains/adapters/sui.js";
import type { SuiExecuteAction } from "../chains/types.js";
import type { SignAndSendBody, SignAndSendResult } from "./wallet.types.js";

function toExecuteAction(body: SignAndSendBody): SuiExecuteAction {
  if (body.action === "transfer_sui") {
    return {
      action: "transfer_sui",
      params: {
        recipient: body.recipient,
        amountMist: BigInt(body.amount_mist),
      },
    };
  }

  let bytes: Uint8Array;
  try {
    bytes = Uint8Array.from(Buffer.from(body.transaction_bytes, "base64"));
  } catch {
    throw new AppError(400, "VALIDATION_ERROR", "transaction_bytes must be valid base64");
  }

  if (bytes.length === 0) {
    throw new AppError(400, "VALIDATION_ERROR", "transaction_bytes cannot be empty");
  }

  return {
    action: "execute_bytes",
    params: { transactionBytes: bytes },
  };
}

export async function signAndSendForUser(
  privyUserId: string,
  body: SignAndSendBody,
): Promise<SignAndSendResult> {
  const action = toExecuteAction(body);
  return executeSuiTransaction(privyUserId, action);
}
