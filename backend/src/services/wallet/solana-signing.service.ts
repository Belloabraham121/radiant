import { getPrivyClient } from "../../infrastructure/privy/client.js";
import { getSolanaCaip2 } from "../../config/solana.js";
import { buildSignerAuthorizationContext } from "../../utils/privy-authorization.js";

/** Privy sign + broadcast for a serialized Solana transaction. */
export async function signAndSendSolanaTransaction(input: {
  privyWalletId: string;
  transaction: Uint8Array;
  caip2?: string;
}): Promise<{ hash: string; caip2: string }> {
  const response = await getPrivyClient().wallets().solana().signAndSendTransaction(
    input.privyWalletId,
    {
      transaction: input.transaction,
      caip2: input.caip2 ?? getSolanaCaip2(),
      authorization_context: buildSignerAuthorizationContext(),
    },
  );

  return {
    hash: response.hash,
    caip2: response.caip2,
  };
}
