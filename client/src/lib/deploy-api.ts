import { apiFetch } from "@/lib/api";

export type DeployJobView = {
  id: string;
  project_id: string;
  status: string;
  provider: string;
  progress_pct: number;
  sandbox_id: string | null;
  sandbox_seconds: number | null;
  logs_tail: string;
  error_message: string | null;
  walrus_url: string | null;
  artifact_revision: number;
  started_at: string | null;
  finished_at: string | null;
  created_at: string;
};

export type StartDeployResult = {
  job_id: string;
  status: string;
  provider: string;
};

export async function startDeploy(
  projectId: string,
  idempotencyKey?: string,
): Promise<StartDeployResult> {
  const headers: HeadersInit = {};
  if (idempotencyKey) {
    headers["Idempotency-Key"] = idempotencyKey;
  }

  return apiFetch<StartDeployResult>("/api/v1/deploy", {
    method: "POST",
    headers,
    body: JSON.stringify({ project_id: projectId }),
  });
}

export async function fetchDeployJob(jobId: string): Promise<DeployJobView> {
  return apiFetch<DeployJobView>(`/api/v1/deploy/${encodeURIComponent(jobId)}`);
}

export function isDeployTerminal(status: string): boolean {
  return status === "completed" || status === "failed" || status === "cancelled";
}

/** Placeholder URL from old mock deploy — not a real on-chain site. */
export function isMockWalrusSiteUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  return /^https:\/\/[a-f0-9]{32}\.walrus\.site\/?$/i.test(url);
}

export function deployLogsIndicateMock(logs: string): boolean {
  return logs.includes("WALRUS_DEPLOY_MOCK") || logs.includes("mock mode");
}
