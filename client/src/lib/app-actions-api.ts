import { apiFetch } from "@/lib/api";
import type { PendingTransaction } from "@/lib/chat-api";

/** Mirrors backend AppActionResult (subset used by preview + approval UI). */
export type AppActionResult =
  | {
      status: "executed";
      action?: string;
      agent_transaction_id?: string;
      digest: string;
      explorer_url: string | null;
      result: Record<string, unknown>;
    }
  | {
      status: "approval_required";
      action?: string;
      agent_transaction_id: string;
      pending: PendingTransaction;
    }
  | {
      status: "error";
      action?: string;
      error: {
        code: string;
        message: string;
        details?: unknown;
      };
    };

export type AgentTransactionApprovalApiResult =
  | {
      status: "executed";
      agent_transaction_id: string;
      digest: string;
      explorer_url: string | null;
      result: Record<string, unknown>;
    }
  | {
      status: "error";
      agent_transaction_id: string;
      error: {
        code: string;
        message: string;
        details?: unknown;
      };
    };

export type AgentTransactionRejectApiResult = {
  status: "rejected";
  agent_transaction_id: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** Parse API envelope or raw JSON body into an app action result when present. */
export function parseAppActionResultFromBody(body: string): AppActionResult | null {
  try {
    const parsed: unknown = JSON.parse(body);
    const data = isRecord(parsed) && "data" in parsed ? parsed.data : parsed;
    if (!isRecord(data) || typeof data.status !== "string") {
      return null;
    }

    if (data.status === "approval_required" && isRecord(data.pending)) {
      const pending = data.pending as PendingTransaction;
      if (typeof pending.id !== "string") return null;
      return {
        status: "approval_required",
        action: typeof data.action === "string" ? data.action : undefined,
        agent_transaction_id:
          typeof data.agent_transaction_id === "string"
            ? data.agent_transaction_id
            : pending.id,
        pending,
      };
    }

    if (data.status === "executed" && typeof data.digest === "string") {
      return {
        status: "executed",
        action: typeof data.action === "string" ? data.action : undefined,
        agent_transaction_id:
          typeof data.agent_transaction_id === "string" ? data.agent_transaction_id : undefined,
        digest: data.digest,
        explorer_url: typeof data.explorer_url === "string" ? data.explorer_url : null,
        result: isRecord(data.result) ? data.result : {},
      };
    }

    if (data.status === "error" && isRecord(data.error)) {
      const error = data.error;
      if (typeof error.code !== "string" || typeof error.message !== "string") {
        return null;
      }
      return {
        status: "error",
        action: typeof data.action === "string" ? data.action : undefined,
        error: {
          code: error.code,
          message: error.message,
          ...(error.details !== undefined ? { details: error.details } : {}),
        },
      };
    }

    return null;
  } catch {
    return null;
  }
}

export function isAppActionApprovalRequired(
  result: AppActionResult,
): result is Extract<AppActionResult, { status: "approval_required" }> {
  return result.status === "approval_required";
}

export type AppActionCatalog = {
  actions: Array<{
    name: string;
    description: string;
    protocol: string;
    default_chain_id: string;
    category: string;
    execute_action: string;
    params: { fields: Array<{ name: string; type: string; required?: boolean; description?: string }> };
  }>;
};

export async function listProjectActions(projectId: string): Promise<AppActionCatalog> {
  return apiFetch(`/api/v1/projects/${projectId}/actions`);
}

export async function executeProjectAction(
  projectId: string,
  action: string,
  params: Record<string, unknown> = {},
): Promise<AppActionResult> {
  return apiFetch(`/api/v1/projects/${projectId}/actions/${action}`, {
    method: "POST",
    body: JSON.stringify(params),
  });
}

export async function listInstallationActions(installationId: string): Promise<AppActionCatalog> {
  return apiFetch(`/api/v1/installations/${installationId}/actions`);
}

export async function executeInstallationAction(
  installationId: string,
  action: string,
  params: Record<string, unknown> = {},
): Promise<AppActionResult> {
  return apiFetch(`/api/v1/installations/${installationId}/actions/${action}`, {
    method: "POST",
    body: JSON.stringify(params),
  });
}
