import type { DeployJob, DeployJobStatus } from "@prisma/client";
import { prisma } from "../../infrastructure/postgres/client.js";

const TERMINAL_STATUSES: DeployJobStatus[] = ["completed", "failed", "cancelled"];

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
