import type { DeployJob, DeployJobStatus } from "@prisma/client";
import { prisma } from "../../infrastructure/postgres/client.js";

const TERMINAL_STATUSES: DeployJobStatus[] = ["completed", "failed", "cancelled"];
const MAX_LOG_CHARS = 64_000;

export async function createDeployJob(data: {
  projectId: string;
  provider: string;
  artifactRevision: number;
}): Promise<DeployJob> {
  return prisma.deployJob.create({
    data: {
      project_id: data.projectId,
      provider: data.provider,
      artifact_revision: data.artifactRevision,
      status: "queued",
    },
  });
}

export async function findDeployJobByIdForUser(
  jobId: string,
  userId: bigint,
): Promise<DeployJob | null> {
  return prisma.deployJob.findFirst({
    where: {
      id: jobId,
      project: { user_id: userId },
    },
  });
}

export async function findRunningDeployJobForProject(
  projectId: string,
  artifactRevision: number,
): Promise<DeployJob | null> {
  return prisma.deployJob.findFirst({
    where: {
      project_id: projectId,
      artifact_revision: artifactRevision,
      status: { in: ["queued", "running"] },
    },
    orderBy: { created_at: "desc" },
  });
}

export async function countRecentDeployJobsForUser(
  userId: bigint,
  since: Date,
): Promise<number> {
  return prisma.deployJob.count({
    where: {
      project: { user_id: userId },
      created_at: { gte: since },
    },
  });
}

export async function markDeployJobRunning(
  jobId: string,
  sandboxId?: string,
): Promise<DeployJob> {
  return prisma.deployJob.update({
    where: { id: jobId },
    data: {
      status: "running",
      started_at: new Date(),
      ...(sandboxId ? { sandbox_id: sandboxId } : {}),
    },
  });
}

export async function completeDeployJob(
  jobId: string,
  data: { sandboxSeconds?: number },
): Promise<DeployJob> {
  return prisma.deployJob.update({
    where: { id: jobId },
    data: {
      status: "completed",
      finished_at: new Date(),
      ...(data.sandboxSeconds !== undefined ? { sandbox_seconds: data.sandboxSeconds } : {}),
    },
  });
}

export async function failDeployJob(
  jobId: string,
  errorMessage: string,
  sandboxSeconds?: number,
): Promise<DeployJob> {
  return prisma.deployJob.update({
    where: { id: jobId },
    data: {
      status: "failed",
      error_message: errorMessage,
      finished_at: new Date(),
      ...(sandboxSeconds !== undefined ? { sandbox_seconds: sandboxSeconds } : {}),
    },
  });
}

export async function appendDeployJobLog(jobId: string, line: string): Promise<void> {
  const job = await prisma.deployJob.findUnique({ where: { id: jobId } });
  if (!job) return;

  const next = `${job.logs}${job.logs.length > 0 ? "\n" : ""}${line}`.slice(-MAX_LOG_CHARS);
  await prisma.deployJob.update({
    where: { id: jobId },
    data: { logs: next },
  });
}

export function tailDeployJobLogs(logs: string, maxChars = 8192): string {
  if (logs.length <= maxChars) return logs;
  return logs.slice(-maxChars);
}

export function progressPctFromLogs(logs: string, status: DeployJobStatus): number {
  if (status === "completed") return 100;
  if (status === "queued") return 0;
  if (status === "failed" || status === "cancelled") return 0;

  const matches = [...logs.matchAll(/\[progress:(\d+)\]/g)];
  const last = matches.at(-1);
  if (last) {
    return Number.parseInt(last[1] ?? "10", 10);
  }

  return status === "running" ? 10 : 0;
}

export async function findDeployJobById(jobId: string): Promise<DeployJob | null> {
  return prisma.deployJob.findUnique({ where: { id: jobId } });
}

export async function findRunningDeployJobBySandboxId(sandboxId: string): Promise<DeployJob | null> {
  return prisma.deployJob.findFirst({
    where: {
      sandbox_id: sandboxId,
      status: "running",
    },
    orderBy: { created_at: "desc" },
  });
}

export type ReconcileSandboxKilledInput = {
  sandboxId: string;
  jobId?: string;
  executionTimeMs?: number;
  killReason?: string;
};

export type ReconcileSandboxKilledResult = {
  jobId: string | null;
  action: "failed_running_job" | "updated_sandbox_seconds" | "ignored";
};

/** Reconcile DeployJob when E2B reports sandbox.lifecycle.killed. */
export async function reconcileDeployJobOnSandboxKilled(
  input: ReconcileSandboxKilledInput,
): Promise<ReconcileSandboxKilledResult> {
  const job =
    input.jobId
      ? await prisma.deployJob.findFirst({
          where: {
            id: input.jobId,
            sandbox_id: input.sandboxId,
          },
        })
      : await findRunningDeployJobBySandboxId(input.sandboxId);

  if (!job) {
    return { jobId: null, action: "ignored" };
  }

  const sandboxSeconds =
    input.executionTimeMs !== undefined
      ? Math.max(1, Math.ceil(input.executionTimeMs / 1000))
      : undefined;

  if (job.status === "running") {
    await prisma.deployJob.update({
      where: { id: job.id },
      data: {
        status: "failed",
        error_message:
          input.killReason ?? "Sandbox terminated before the deploy pipeline finished.",
        finished_at: new Date(),
        sandbox_seconds: sandboxSeconds ?? job.sandbox_seconds,
      },
    });
    return { jobId: job.id, action: "failed_running_job" };
  }

  if (sandboxSeconds !== undefined && job.sandbox_seconds === null) {
    await prisma.deployJob.update({
      where: { id: job.id },
      data: { sandbox_seconds: sandboxSeconds },
    });
    return { jobId: job.id, action: "updated_sandbox_seconds" };
  }

  return { jobId: job.id, action: "ignored" };
}

export function isTerminalDeployJobStatus(status: DeployJobStatus): boolean {
  return TERMINAL_STATUSES.includes(status);
}
