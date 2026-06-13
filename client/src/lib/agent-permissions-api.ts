import { apiFetch } from "./api";

export type AgentPermissions = {
  auto_approve_enabled: boolean;
  auto_approve_max_sui: number;
  allow_flash_loans: boolean;
};

export async function fetchAgentPermissions(): Promise<AgentPermissions> {
  return apiFetch<AgentPermissions>("/api/v1/agent/permissions");
}

export async function updateAgentPermissions(
  patch: Partial<AgentPermissions>,
): Promise<AgentPermissions> {
  return apiFetch<AgentPermissions>("/api/v1/agent/permissions", {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
}
