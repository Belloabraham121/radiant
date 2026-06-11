import { base58 } from "@scure/base";
import { messageWithIntent } from "@mysten/sui/cryptography";
import { toSerializedSignature } from "@mysten/sui/cryptography";
import { publicKeyFromRawBytes } from "@mysten/sui/verify";
import { getPrivyClient } from "../../infrastructure/privy/client.js";
import { AppError } from "../../errors/app-error.js";
import { buildSignerAuthorizationContext } from "../../utils/privy-authorization.js";

/** Intent bytes Privy must sign for a Sui transaction (blake2b256 over intent message). */
export function buildSuiTransactionIntentHex(transactionBytes: Uint8Array): string {
  const intentMessage = messageWithIntent("TransactionData", transactionBytes);
  return Buffer.from(intentMessage).toString("hex");
}

/** Privy `0x`-prefixed hex signature → 64-byte Ed25519 signature. */
export function parsePrivyEd25519Signature(signatureHex: string): Uint8Array {
  const normalized = signatureHex.startsWith("0x") ? signatureHex.slice(2) : signatureHex;
  if (!/^[0-9a-fA-F]+$/.test(normalized) || normalized.length !== 128) {
    throw new AppError(502, "INVALID_SIGNATURE", "Privy returned an invalid Ed25519 signature");
  }
  return Uint8Array.from(Buffer.from(normalized, "hex"));
}

export function buildSuiSerializedSignature(
  rawSignature: Uint8Array,
  publicKeyBase58: string,
  expectedAddress: string,
): string {
  const publicKey = publicKeyFromRawBytes("ED25519", base58.decode(publicKeyBase58), {
    address: expectedAddress,
  });

  return toSerializedSignature({
    signature: rawSignature,
    signatureScheme: "ED25519",
    publicKey,
  });
}

export async function signSuiTransactionBytes(input: {
  privyWalletId: string;
  suiAddress: string;
  publicKeyBase58: string;
  transactionBytes: Uint8Array;
}): Promise<string> {
  const intentHex = buildSuiTransactionIntentHex(input.transactionBytes);

  const { signature } = await getPrivyClient().wallets().rawSign(input.privyWalletId, {
    authorization_context: buildSignerAuthorizationContext(),
    params: {
      bytes: intentHex,
      encoding: "hex",
      hash_function: "blake2b256",
    },
  });

  const rawSignature = parsePrivyEd25519Signature(signature);
  return buildSuiSerializedSignature(
    rawSignature,
    input.publicKeyBase58,
    input.suiAddress,
  );
}
