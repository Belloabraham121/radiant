import type { AgentWallet, Prisma } from "@prisma/client";
import { prisma } from "../../infrastructure/postgres/client.js";

export type AgentWalletWithUser = AgentWallet & {
  user: { privy_user_id: string };
};

export async function findAgentWalletByPrivyUserId(
  privyUserId: string,
): Promise<AgentWallet | null> {
  return prisma.agentWallet.findFirst({
    where: { user: { privy_user_id: privyUserId } },
  });
}

export async function findAgentWalletBySuiAddress(
  suiAddress: string,
): Promise<AgentWalletWithUser | null> {
  return prisma.agentWallet.findUnique({
    where: { sui_address: suiAddress },
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
