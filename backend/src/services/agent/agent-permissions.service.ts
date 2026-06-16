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
    allow_flash_loans: false,
    auto_approve_flash_loans: false,
    allow_governance: false,
    allow_margin: false,
    allow_predict: false,
  };
}

export function agentPermissionsFromUser(user: {
  agent_auto_approve_enabled: boolean;
  agent_auto_approve_max_sui: number;
  agent_allow_flash_loans?: boolean;
  agent_auto_approve_flash_loans?: boolean;
  agent_allow_governance?: boolean;
  agent_allow_margin?: boolean;
  agent_allow_predict?: boolean;
}): AgentPermissions {
  return {
    auto_approve_enabled: user.agent_auto_approve_enabled,
    auto_approve_max_sui: user.agent_auto_approve_max_sui,
    allow_flash_loans: user.agent_allow_flash_loans ?? false,
    auto_approve_flash_loans: user.agent_auto_approve_flash_loans ?? false,
    allow_governance: user.agent_allow_governance ?? false,
    allow_margin: user.agent_allow_margin ?? false,
    allow_predict: user.agent_allow_predict ?? false,
  };
}

export async function getAgentPermissions(privyUserId: string): Promise<AgentPermissions> {
  const user = await findUserByPrivyId(privyUserId);
  if (!user) {
    return defaultAgentPermissions();
  }
  return agentPermissionsFromUser(user);
}

export async function assertFlashLoansEnabled(privyUserId: string): Promise<void> {
  const permissions = await getAgentPermissions(privyUserId);
  if (!permissions.allow_flash_loans) {
    throw new AppError(
      403,
      "FLASH_LOANS_DISABLED",
      "Flash loans are disabled for this account. Enable them in Settings → Agent permissions.",
    );
  }
}

export async function assertGovernanceEnabled(privyUserId: string): Promise<void> {
  const permissions = await getAgentPermissions(privyUserId);
  if (!permissions.allow_governance) {
    throw new AppError(
      403,
      "GOVERNANCE_DISABLED",
      "DeepBook governance actions are disabled for this account. Enable Allow governance actions in Settings → Agent permissions.",
    );
  }
}

export async function assertMarginEnabled(privyUserId: string): Promise<void> {
  const permissions = await getAgentPermissions(privyUserId);
  if (!permissions.allow_margin) {
    throw new AppError(
      403,
      "MARGIN_DISABLED",
      "DeepBook Margin trading is disabled for this account. Enable Allow margin trading in Settings → Agent permissions.",
    );
  }
}

export async function assertPredictEnabled(privyUserId: string): Promise<void> {
  const permissions = await getAgentPermissions(privyUserId);
  if (!permissions.allow_predict) {
    throw new AppError(
      403,
      "PREDICT_DISABLED",
      "DeepBook Predict markets are disabled for this account. Enable Allow prediction markets in Settings → Agent permissions.",
    );
  }
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
      ...(patch.allow_flash_loans !== undefined
        ? { agent_allow_flash_loans: patch.allow_flash_loans }
        : {}),
      ...(patch.auto_approve_flash_loans !== undefined
        ? { agent_auto_approve_flash_loans: patch.auto_approve_flash_loans }
        : {}),
      ...(patch.allow_governance !== undefined
        ? { agent_allow_governance: patch.allow_governance }
        : {}),
      ...(patch.allow_margin !== undefined
        ? { agent_allow_margin: patch.allow_margin }
        : {}),
      ...(patch.allow_predict !== undefined
        ? { agent_allow_predict: patch.allow_predict }
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
