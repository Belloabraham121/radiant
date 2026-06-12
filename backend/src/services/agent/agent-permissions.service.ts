import { getAutoApproveMaxDisplay } from "../../config/agent.js";
import { AppError } from "../../errors/app-error.js";
import { prisma } from "../../infrastructure/postgres/client.js";
import { findUserByPrivyId } from "../auth/user.repository.js";
import type { ChainId } from "../chains/types.js";
import type { AgentPermissions } from "./agent-permissions.types.js";

export function defaultAgentPermissions(): AgentPermissions {
  return {
    auto_approve_enabled: true,
    auto_approve_max_sui: getAutoApproveMaxDisplay("sui"),
  };
}

export function agentPermissionsFromUser(user: {
  agent_auto_approve_enabled: boolean;
  agent_auto_approve_max_sui: number;
}): AgentPermissions {
  return {
    auto_approve_enabled: user.agent_auto_approve_enabled,
    auto_approve_max_sui: user.agent_auto_approve_max_sui,
  };
}

export async function getAgentPermissions(privyUserId: string): Promise<AgentPermissions> {
  const user = await findUserByPrivyId(privyUserId);
  if (!user) {
    return defaultAgentPermissions();
  }
  return agentPermissionsFromUser(user);
}

export async function updateAgentPermissions(
  privyUserId: string,
  patch: Partial<AgentPermissions>,
): Promise<AgentPermissions> {
  const user = await findUserByPrivyId(privyUserId);
  if (!user) {
    throw new AppError(404, "USER_NOT_FOUND", "User not found");
  }

  const updated = await prisma.user.update({
    where: { privy_user_id: privyUserId },
    data: {
      ...(patch.auto_approve_enabled !== undefined
        ? { agent_auto_approve_enabled: patch.auto_approve_enabled }
        : {}),
      ...(patch.auto_approve_max_sui !== undefined
        ? { agent_auto_approve_max_sui: patch.auto_approve_max_sui }
        : {}),
    },
  });

  return agentPermissionsFromUser(updated);
}

export function resolveAutoApproveMaxDisplay(
  permissions: AgentPermissions,
  chainId: ChainId,
): number {
  if (chainId === "sui") {
    return permissions.auto_approve_max_sui;
  }
  return getAutoApproveMaxDisplay(chainId);
}

export function resolveAutoApproveMaxAtomic(
  permissions: AgentPermissions,
  chainId: ChainId,
): bigint {
  const display = resolveAutoApproveMaxDisplay(permissions, chainId);
  switch (chainId) {
    case "sui":
      return BigInt(Math.floor(display * 1_000_000_000));
    case "ethereum":
      return BigInt(Math.floor(display * 1e18));
    case "solana":
      return BigInt(Math.floor(display * 1_000_000_000));
    default:
      return BigInt(0);
  }
}

export function approvalThresholdLabel(
  chainId: ChainId,
  permissions: AgentPermissions,
): string {
  const max = resolveAutoApproveMaxDisplay(permissions, chainId);
  switch (chainId) {
    case "sui":
      return `${max} SUI`;
    case "ethereum":
      return `${max} ETH`;
    case "solana":
      return `${max} SOL`;
    default:
      return String(max);
  }
}
