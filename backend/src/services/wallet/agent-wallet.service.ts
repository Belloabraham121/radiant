import type { AgentWallet } from "@prisma/client";
import { getDefaultAgentChainId } from "../../config/chains.js";
import { AppError } from "../../errors/app-error.js";
import { findUserByPrivyId } from "../auth/user.repository.js";
import type { ChainId } from "../chains/types.js";
import {
  balanceResultToWalletData,
  getBalanceForAddress,
} from "./balance.service.js";
import {
  createAgentWallet,
  findAgentWalletByChainAndAddress,
  findAgentWalletByPrivyUserIdAndChain,
  findAgentWalletForUserChain,
  findAgentWalletsByPrivyUserId,
  updateAgentWalletSignerAdded,
} from "./agent-wallet.repository.js";
import type {
  AgentWalletSummary,
  RegisterWalletInput,
  WalletBalanceData,
} from "./wallet.types.js";

export async function resolveAgentWalletByPrivyUserId(
  privyUserId: string,
  chainId: ChainId = getDefaultAgentChainId(),
): Promise<AgentWallet | null> {
  return findAgentWalletByPrivyUserIdAndChain(privyUserId, chainId);
}

export async function listAgentWalletsForPrivyUser(
  privyUserId: string,
): Promise<AgentWallet[]> {
  return findAgentWalletsByPrivyUserId(privyUserId);
}

export async function isWalletFunded(
  address: string,
  chainId: ChainId = getDefaultAgentChainId(),
): Promise<boolean> {
  try {
    const result = await getBalanceForAddress(chainId, address);
    return result.funded;
  } catch (err) {
    if (
      err instanceof AppError &&
      (err.code === "CHAIN_ADAPTER_MISSING" || err.code === "CHAIN_NOT_ENABLED")
    ) {
      return false;
    }
    throw err;
  }
}

export async function getWalletBalancesForPrivyUser(
  privyUserId: string,
  chainId: ChainId = getDefaultAgentChainId(),
): Promise<WalletBalanceData> {
  const wallet = await findAgentWalletByPrivyUserIdAndChain(privyUserId, chainId);
  if (!wallet) {
    throw new AppError(
      404,
      "WALLET_NOT_FOUND",
      `No agent wallet registered for chain "${chainId}"`,
    );
  }

  const result = await getBalanceForAddress(chainId, wallet.address);
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

  const existing = await findAgentWalletForUserChain(user.id, input.chain_type);
  if (existing) {
    const sameWallet =
      existing.privy_wallet_id === input.privy_wallet_id &&
      existing.address === input.address;

    if (!sameWallet) {
      throw new AppError(
        409,
        "WALLET_ALREADY_REGISTERED",
        `Agent wallet already exists for chain "${input.chain_type}"`,
      );
    }

    if (input.signer_added && !existing.signer_added) {
      return updateAgentWalletSignerAdded(existing.id, true);
    }

    return existing;
  }

  const addressOwner = await findAgentWalletByChainAndAddress(
    input.chain_type,
    input.address,
  );
  if (addressOwner && addressOwner.user.privy_user_id !== privyUserId) {
    throw new AppError(
      409,
      "WALLET_ADDRESS_CONFLICT",
      "This wallet address is linked to another user",
    );
  }

  return createAgentWallet({
    user: { connect: { id: user.id } },
    chain_type: input.chain_type,
    address: input.address,
    privy_wallet_id: input.privy_wallet_id,
    signer_added: input.signer_added,
  });
}

export function toAgentWalletSummary(
  wallet: AgentWallet,
  funded: boolean,
): AgentWalletSummary {
  return {
    chain_type: wallet.chain_type as ChainId,
    address: wallet.address,
    privy_wallet_id: wallet.privy_wallet_id,
    signer_added: wallet.signer_added,
    funded,
    ...(wallet.chain_type === "sui" ? { sui_address: wallet.address } : {}),
  };
}
