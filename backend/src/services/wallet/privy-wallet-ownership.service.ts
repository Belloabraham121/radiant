import type { Wallet } from "@privy-io/node";
import { AppError } from "../../errors/app-error.js";
import { getPrivyClient } from "../../infrastructure/privy/client.js";
import type { ChainId } from "../chains/types.js";
import type { RegisterWalletInput } from "./wallet.types.js";

function normalizeWalletAddress(address: string, chainType: ChainId): string {
  if (chainType === "ethereum") {
    return address.toLowerCase();
  }
  return address;
}

async function fetchPrivyWallet(privyWalletId: string): Promise<Wallet> {
  try {
    return await getPrivyClient().wallets().get(privyWalletId);
  } catch {
    throw new AppError(404, "WALLET_NOT_FOUND", "Privy wallet not found");
  }
}

async function userOwnsEmbeddedWallet(
  privyUserId: string,
  input: RegisterWalletInput,
): Promise<boolean> {
  let privyUser;
  try {
    privyUser = await getPrivyClient().users()._get(privyUserId);
  } catch {
    throw new AppError(401, "UNAUTHORIZED", "Unable to verify wallet ownership");
  }

  const normalizedInput = normalizeWalletAddress(input.address, input.chain_type);

  return privyUser.linked_accounts.some((account) => {
    if (account.type !== "wallet" || account.connector_type !== "embedded") {
      return false;
    }
    if (account.id !== input.privy_wallet_id) {
      return false;
    }
    if ("chain_type" in account && account.chain_type !== input.chain_type) {
      return false;
    }
    return normalizeWalletAddress(account.address, input.chain_type) === normalizedInput;
  });
}

/** Confirms the wallet exists in Privy, matches chain/address, and belongs to the user. */
export async function assertPrivyWalletOwnership(
  privyUserId: string,
  input: RegisterWalletInput,
): Promise<void> {
  const privyWallet = await fetchPrivyWallet(input.privy_wallet_id);

  if (privyWallet.chain_type !== input.chain_type) {
    throw new AppError(
      400,
      "INVALID_WALLET",
      `Wallet chain type "${privyWallet.chain_type}" does not match "${input.chain_type}"`,
    );
  }

  if (
    normalizeWalletAddress(privyWallet.address, input.chain_type) !==
    normalizeWalletAddress(input.address, input.chain_type)
  ) {
    throw new AppError(
      409,
      "WALLET_ADDRESS_MISMATCH",
      "Address does not match Privy wallet metadata",
    );
  }

  const ownsWallet = await userOwnsEmbeddedWallet(privyUserId, input);
  if (!ownsWallet) {
    throw new AppError(
      403,
      "WALLET_OWNERSHIP_MISMATCH",
      "Wallet does not belong to the authenticated user",
    );
  }
}
