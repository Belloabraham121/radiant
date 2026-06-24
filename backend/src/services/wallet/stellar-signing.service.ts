import { Keypair, type Transaction } from "@stellar/stellar-sdk";
import { getPrivyClient } from "../../infrastructure/privy/client.js";
import { AppError } from "../../errors/app-error.js";
import { buildSignerAuthorizationContext } from "../../utils/privy-authorization.js";
import { parsePrivyEd25519Signature } from "./sui-signing.service.js";

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** Network transaction hash as `0x`-prefixed hex for Privy `rawSign`. */
export function getStellarTransactionHashHex(transaction: Transaction): string {
  return `0x${transaction.hash().toString("hex")}`;
}

/** Privy `rawSign` over the tx hash, then attach the Ed25519 signature to the XDR. */
export async function signStellarTransaction(input: {
  privyWalletId: string;
  stellarAddress: string;
  transaction: Transaction;
}): Promise<void> {
  try {
    const hashHex = getStellarTransactionHashHex(input.transaction);

    const { signature } = await getPrivyClient().wallets().rawSign(input.privyWalletId, {
      authorization_context: buildSignerAuthorizationContext(),
      params: { hash: hashHex },
    });

    const signatureBytes = parsePrivyEd25519Signature(signature);
    const keypair = Keypair.fromPublicKey(input.stellarAddress);
    input.transaction.addSignature(
      keypair.publicKey(),
      Buffer.from(signatureBytes).toString("base64"),
    );
  } catch (err) {
    if (err instanceof AppError) {
      throw err;
    }
    throw new AppError(
      502,
      "STELLAR_SIGNING_FAILED",
      `Failed to sign Stellar transaction: ${errorMessage(err)}`,
      { cause: errorMessage(err) },
    );
  }
}
