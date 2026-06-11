import type { AgentWallet } from "@prisma/client";
import { AppError } from "../../errors/app-error.js";
import { findUserByPrivyId } from "../auth/user.repository.js";
import {
  createAgentWallet,
  findAgentWalletByPrivyUserId,
  findAgentWalletBySuiAddress,
  updateAgentWalletSignerAdded,
} from "./agent-wallet.repository.js";
import { getDefaultAgentChainId } from "../../config/chains.js";
import type { ChainId } from "../chains/types.js";
import {
  balanceResultToWalletData,
  getBalanceForAddress,
} from "./balance.service.js";
import type { RegisterWalletInput, WalletBalanceData } from "./wallet.types.js";

export async function resolveAgentWalletByPrivyUserId(
  privyUserId: string,
): Promise<AgentWallet | null> {
  return findAgentWalletByPrivyUserId(privyUserId);
}

export async function isWalletFunded(
  address: string,
  chainId: ChainId = getDefaultAgentChainId(),
): Promise<boolean> {
  const result = await getBalanceForAddress(chainId, address);
  return result.funded;
}

function resolveWalletAddressForChain(
  wallet: { sui_address: string },
  chainId: ChainId,
): string {
  if (chainId !== "sui") {
    throw new AppError(
      404,
      "WALLET_NOT_FOUND",
      `No agent wallet registered for chain "${chainId}"`,
    );
  }
  return wallet.sui_address;
}

export async function getWalletBalancesForPrivyUser(
  privyUserId: string,
  chainId: ChainId = getDefaultAgentChainId(),
): Promise<WalletBalanceData> {
  const wallet = await findAgentWalletByPrivyUserId(privyUserId);
  if (!wallet) {
    throw new AppError(404, "WALLET_NOT_FOUND", "Agent wallet not registered");
  }

  const address = resolveWalletAddressForChain(wallet, chainId);
  const result = await getBalanceForAddress(chainId, address);
  return balanceResultToWalletData(result);
}

export async function registerAgentWallet(
  privyUserId: string,
  input: RegisterWalletInput,
): Promise<AgentWallet> {
  const user = await findUserByPrivyId(privyUserId);
  if (!user) {
    throw new AppError(404, "USER_NOT_FOUND", "User not found. Call GET /api/v1/auth/me first.");
  }

  if (user.agent_wallet) {
    const existing = user.agent_wallet;
    const sameWallet =
      existing.privy_wallet_id === input.privy_wallet_id &&
      existing.sui_address === input.sui_address;

    if (!sameWallet) {
      throw new AppError(
        409,
        "WALLET_ALREADY_REGISTERED",
        "Agent wallet already exists for this user",
      );
    }

    if (input.signer_added && !existing.signer_added) {
      return updateAgentWalletSignerAdded(existing.id, true);
    }

    return existing;
  }

  const addressOwner = await findAgentWalletBySuiAddress(input.sui_address);
  if (addressOwner && addressOwner.user.privy_user_id !== privyUserId) {
    throw new AppError(
      409,
      "WALLET_ADDRESS_CONFLICT",
      "This Sui address is linked to another user",
    );
  }

  return createAgentWallet({
    user: { connect: { id: user.id } },
    privy_wallet_id: input.privy_wallet_id,
    sui_address: input.sui_address,
    signer_added: input.signer_added,
  });
}

export function toAgentWalletSummary(wallet: AgentWallet, funded: boolean) {
  return {
    sui_address: wallet.sui_address,
    privy_wallet_id: wallet.privy_wallet_id,
    signer_added: wallet.signer_added,
    funded,
  };
}
