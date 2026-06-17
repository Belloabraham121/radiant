import { AppError } from "../../errors/app-error.js";
import { getDeployConfig } from "../../config/deploy.js";
import { findUserByPrivyId } from "../auth/user.repository.js";
import { isUuid } from "../projects/app-scope-resolver.service.js";
import { findProjectByIdForUser } from "../projects/project.repository.js";
import { cacheGet, cacheSet } from "../../infrastructure/redis/cache.js";
import {
  createDeployJob,
  countRecentDeployJobsForUser,
  findDeployJobByIdForUser,
  findRunningDeployJobForProject,
  progressPctFromLogs,
  tailDeployJobLogs,
} from "./deploy-job.repository.js";
import type { DeployJobView, StartDeployResult } from "./job-types.js";
import { resolveDeployProvider } from "./template-registry.js";
import { enqueueDeployJob } from "../../infrastructure/redis/queues.js";

export async function startDeployForUser(
  privyUserId: string,
  projectId: string,
  idempotencyKey?: string,
): Promise<StartDeployResult> {
  const user = await findUserByPrivyId(privyUserId);
  if (!user) {
    throw new AppError(404, "USER_NOT_FOUND", "User not found");
  }

  if (idempotencyKey) {
    const cacheKey = `deploy:idempotency:${user.id}:${idempotencyKey}`;
    const cached = await cacheGet<StartDeployResult>(cacheKey);
    if (cached) return cached;
  }

  if (!isUuid(projectId)) {
    throw new AppError(
      400,
      "INVALID_PROJECT_ID",
      "project_id must be a valid UUID from list_session_projects.",
    );
  }

  const project = await findProjectByIdForUser(projectId, user.id);
  if (!project) {
    throw new AppError(404, "PROJECT_NOT_FOUND", "Project not found");
  }

  const { maxPerUserPerHour, idempotencyTtlSeconds } = getDeployConfig();
  const since = new Date(Date.now() - 60 * 60 * 1000);
  const recentCount = await countRecentDeployJobsForUser(user.id, since);
  if (recentCount >= maxPerUserPerHour) {
    throw new AppError(
      429,
      "DEPLOY_RATE_LIMITED",
      `Deploy limit reached (${maxPerUserPerHour} per hour on Hobby). Try again later.`,
    );
  }

  const duplicate = await findRunningDeployJobForProject(project.id, project.artifact_revision);
  if (duplicate) {
    return {
      job_id: duplicate.id,
      status: duplicate.status,
      provider: duplicate.provider,
    };
  }

  const provider = resolveDeployProvider(project.template);
  const job = await createDeployJob({
    projectId: project.id,
    provider,
    artifactRevision: project.artifact_revision,
  });

  await enqueueDeployJob(job.id);

  const result: StartDeployResult = {
    job_id: job.id,
    status: job.status,
    provider: job.provider,
  };

  if (idempotencyKey) {
    const cacheKey = `deploy:idempotency:${user.id}:${idempotencyKey}`;
    await cacheSet(cacheKey, result, idempotencyTtlSeconds);
  }

  return result;
}

export async function getDeployJobForUser(
  privyUserId: string,
  jobId: string,
): Promise<DeployJobView> {
  const user = await findUserByPrivyId(privyUserId);
  if (!user) {
    throw new AppError(404, "USER_NOT_FOUND", "User not found");
  }

  const job = await findDeployJobByIdForUser(jobId, user.id);
  if (!job) {
    throw new AppError(404, "DEPLOY_JOB_NOT_FOUND", "Deploy job not found");
  }

  const project = await findProjectByIdForUser(job.project_id, user.id);

  return {
    id: job.id,
    project_id: job.project_id,
    status: job.status,
    provider: job.provider,
    progress_pct: progressPctFromLogs(job.logs, job.status),
    sandbox_id: job.sandbox_id,
    sandbox_seconds: job.sandbox_seconds,
    logs_tail: tailDeployJobLogs(job.logs),
    error_message: job.error_message,
    walrus_url: project?.walrus_url ?? null,
    artifact_revision: job.artifact_revision,
    started_at: job.started_at?.toISOString() ?? null,
    finished_at: job.finished_at?.toISOString() ?? null,
    created_at: job.created_at.toISOString(),
  };
}
