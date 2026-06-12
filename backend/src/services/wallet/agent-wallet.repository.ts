import type { AgentWallet, Prisma } from "@prisma/client";
import type { ChainId } from "../chains/types.js";
import { prisma } from "../../infrastructure/postgres/client.js";

export type AgentWalletWithUser = AgentWallet & {
  user: { privy_user_id: string };
};

export async function findAgentWalletsByPrivyUserId(
  privyUserId: string,
): Promise<AgentWallet[]> {
  return prisma.agentWallet.findMany({
    where: { user: { privy_user_id: privyUserId } },
    orderBy: { created_at: "asc" },
  });
}

export async function findAgentWalletByPrivyUserIdAndChain(
  privyUserId: string,
  chainType: ChainId,
): Promise<AgentWallet | null> {
  return prisma.agentWallet.findFirst({
    where: {
      user: { privy_user_id: privyUserId },
      chain_type: chainType,
    },
  });
}

/** Resolve user id first to avoid nested lookup failures when user is missing. */
export async function findAgentWalletForUserChain(
  userId: bigint,
  chainType: ChainId,
): Promise<AgentWallet | null> {
  return prisma.agentWallet.findUnique({
    where: {
      user_id_chain_type: {
        user_id: userId,
        chain_type: chainType,
      },
    },
  });
}

export async function findAgentWalletByChainAndAddress(
  chainType: ChainId,
  address: string,
): Promise<AgentWalletWithUser | null> {
  return prisma.agentWallet.findUnique({
    where: {
      chain_type_address: {
        chain_type: chainType,
        address,
      },
    },
    include: { user: { select: { privy_user_id: true } } },
  });
}

export async function createAgentWallet(
  data: Prisma.AgentWalletCreateInput,
): Promise<AgentWallet> {
  return prisma.agentWallet.create({ data });
}

export async function updateAgentWalletSignerAdded(
  walletId: bigint,
  signerAdded: boolean,
): Promise<AgentWallet> {
  return prisma.agentWallet.update({
    where: { id: walletId },
    data: { signer_added: signerAdded },
  });
}
