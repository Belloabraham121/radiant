import { base58 } from "@scure/base";
import { messageWithIntent } from "@mysten/sui/cryptography";
import { toSerializedSignature } from "@mysten/sui/cryptography";
import { publicKeyFromRawBytes } from "@mysten/sui/verify";
import { getPrivyClient } from "../../infrastructure/privy/client.js";
import { AppError } from "../../errors/app-error.js";
import { isBase58Encoded } from "../../utils/agent-tool-errors.js";
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

/** Privy returns Sui Ed25519 keys as hex or base58 (33-byte flag+key or raw 32-byte). */
export function parsePrivyEd25519PublicKey(publicKey: string): Uint8Array {
  const trimmed = publicKey.trim();
  const hex = trimmed.startsWith("0x") ? trimmed.slice(2) : trimmed;

  if (/^[0-9a-fA-F]+$/.test(hex)) {
    if (hex.length !== 64 && hex.length !== 66) {
      throw new AppError(
        502,
        "INVALID_PUBLIC_KEY",
        "Privy Sui public key hex has invalid length",
      );
    }

    let bytes = Uint8Array.from(Buffer.from(hex, "hex"));
    if (bytes.length === 33 && bytes[0] === 0x00) {
      bytes = bytes.slice(1);
    }
    if (bytes.length !== 32) {
      throw new AppError(
        502,
        "INVALID_PUBLIC_KEY",
        "Expected a 32-byte Ed25519 public key from Privy",
      );
    }
    return bytes;
  }

  if (isBase58Encoded(trimmed)) {
    let bytes = base58.decode(trimmed);
    if (bytes.length === 33 && bytes[0] === 0x00) {
      bytes = bytes.slice(1);
    }
    if (bytes.length !== 32) {
      throw new AppError(
        502,
        "INVALID_PUBLIC_KEY",
        "Expected a 32-byte Ed25519 public key from Privy",
      );
    }
    return bytes;
  }

  throw new AppError(
    502,
    "INVALID_PUBLIC_KEY",
    "Unrecognized Privy Sui public key encoding",
  );
}

export function buildSuiSerializedSignature(
  rawSignature: Uint8Array,
  publicKey: string,
  expectedAddress: string,
): string {
  const rawPublicKey = parsePrivyEd25519PublicKey(publicKey);
  const key = publicKeyFromRawBytes("ED25519", rawPublicKey, {
    address: expectedAddress,
  });

  return toSerializedSignature({
    signature: rawSignature,
    signatureScheme: "ED25519",
    publicKey: key,
  });
}

export async function signSuiTransactionBytes(input: {
  privyWalletId: string;
  suiAddress: string;
  publicKeyBase58: string;
  transactionBytes: Uint8Array;
}): Promise<string> {
  try {
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
  } catch (err) {
    if (err instanceof AppError) {
      throw err;
    }
    throw new AppError(
      502,
      "SIGNING_FAILED",
      `Failed to sign Sui transaction: ${errorMessage(err)}`,
    );
  }
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
