import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { prisma } from "../../infrastructure/postgres/client.js";
import { getSandboxConfig } from "../../config/sandbox.js";
import { AppError } from "../../errors/app-error.js";
import { listArtifactFiles } from "../projects/artifact.repository.js";
import { ensureAppEntry } from "../projects/ensure-app-entry.js";
import {
  appendDeployJobLog,
  completeDeployJob,
  failDeployJob,
  findDeployJobById,
  markDeployJobRunning,
} from "./deploy-job.repository.js";
import { DEPLOY_PROGRESS_PCT, type DeployPipelineStep } from "./job-types.js";
import { isFixedTemplate } from "./template-registry.js";
import {
  collectDistFromSandbox,
  prepareFixedTemplateDist,
  writeDistFilesToDir,
} from "./dist-collector.js";
import { getSandboxProviderByName } from "../sandbox/sandbox.factory.js";
import { setProjectStatus, updateProject } from "../projects/project.repository.js";
import { logger } from "../../shared/logger.js";
import type { SandboxProviderName } from "../sandbox/sandbox.provider.js";

function formatDeployError(error: unknown): { message: string; logTail: string } {
  if (!(error instanceof AppError)) {
    const message = error instanceof Error ? error.message : "Deploy pipeline failed";
    return { message, logTail: message };
  }

  const details = error.details;
  let stderr = "";
  let stdout = "";
  if (details && typeof details === "object") {
    const record = details as Record<string, unknown>;
    if (typeof record.stderr === "string") stderr = record.stderr.trim();
    if (typeof record.stdout === "string") stdout = record.stdout.trim();
  }

  const logTail = stderr || stdout || error.message;
  const message =
    logTail.length > 0 && logTail !== error.message
      ? `${error.message}: ${logTail.split("\n").slice(-3).join(" ")}`
      : error.message;

  return { message: message.slice(0, 500), logTail: logTail.slice(0, 4000) };
}

async function logStep(jobId: string, step: DeployPipelineStep, message: string): Promise<void> {
  const pct = DEPLOY_PROGRESS_PCT[step];
  await appendDeployJobLog(jobId, `[progress:${pct}] ${message}`);
}

export async function runDeployPipeline(jobId: string): Promise<void> {
  const job = await findDeployJobById(jobId);
  if (!job) {
    throw new AppError(404, "DEPLOY_JOB_NOT_FOUND", "Deploy job not found");
  }

  if (job.status !== "queued") {
    return;
  }

  const project = await prisma.project.findUnique({ where: { id: job.project_id } });
  if (!project) {
    await failDeployJob(jobId, "Project not found");
    return;
  }

  let tempDistDir: string | null = null;
  let handleId: string | null = null;
  const providerName = job.provider;
  const sandboxProvider =
    providerName === "none" ? null : getSandboxProviderByName(providerName as SandboxProviderName);
  let sandboxSeconds: number | undefined;
  const sandboxStarted = Date.now();

  try {
    await markDeployJobRunning(jobId);
    await logStep(jobId, "load", "Loading project and artifact files");
    await setProjectStatus(project.id, "deploying");

    const rawArtifactFiles = await listArtifactFiles(project.id, job.artifact_revision);
    if (!isFixedTemplate(project.template) && rawArtifactFiles.length === 0) {
      throw new AppError(400, "ARTIFACT_MISSING", "Custom build requires artifact source files");
    }

    const artifactFiles = ensureAppEntry(
      rawArtifactFiles.map((file) => ({ path: file.path, content: file.content })),
      { template: project.template },
    ).map((file) => ({ path: file.path, content: file.content }));

    if (providerName === "none") {
      await logStep(jobId, "sandbox", "Using pre-built template dist (no sandbox)");
      const params =
        typeof project.template_params === "object" && project.template_params !== null
          ? (project.template_params as Record<string, unknown>)
          : {};
      tempDistDir = await prepareFixedTemplateDist(project.template, params, {
        name: project.name,
        tagline: project.tagline,
        accent: project.accent,
      });
    } else if (!sandboxProvider) {
      throw new AppError(500, "SANDBOX_PROVIDER_MISSING", "Sandbox provider is not configured");
    } else {
      await logStep(jobId, "sandbox", `Starting ${providerName} sandbox`);
      const createResult = await sandboxProvider.create({
        jobId,
        projectId: project.id,
        userId: String(project.user_id),
      });
      handleId = createResult.handleId;
      await markDeployJobRunning(jobId, createResult.sandboxId);

      try {
        const writes = artifactFiles.map((file) => ({
          path: file.path.replace(/^\/workspace\//, ""),
          content: file.content,
        }));

        if (writes.length > 0) {
          await sandboxProvider.writeFiles(handleId, writes);
        }

        await logStep(jobId, "build", "Running production build in sandbox");
        const { buildCommandTimeoutMs } = getSandboxConfig();
        const build = await sandboxProvider.run(handleId, "cd /workspace && npm run build", {
          cwd: "/workspace",
          timeoutMs: buildCommandTimeoutMs,
          onLine: (line) => {
            void appendDeployJobLog(jobId, line);
          },
        });

        if (build.exitCode !== 0) {
          throw new AppError(500, "BUILD_FAILED", "Production build failed in sandbox", {
            stderr: build.stderr,
          });
        }

        const distFiles = await collectDistFromSandbox(sandboxProvider, handleId);
        tempDistDir = await mkdtemp(join(tmpdir(), "radiant-dist-"));
        await writeDistFilesToDir(distFiles, tempDistDir);
      } finally {
        sandboxSeconds = Math.max(1, Math.ceil((Date.now() - sandboxStarted) / 1000));
        await logStep(jobId, "sandbox", "Killing sandbox");
        await sandboxProvider.kill(handleId);
        handleId = null;
      }
    }

    await logStep(jobId, "finalize", "Marking app ready in Radiant");
    await updateProject(project.id, {
      status: "live",
      walrus_url: null,
    });

    await completeDeployJob(jobId, { sandboxSeconds });
    await logStep(jobId, "done", "Build verified — open this app from Projects or chat in Radiant");
  } catch (error) {
    const { message, logTail } = formatDeployError(error);

    logger.error("Deploy pipeline failed", { jobId, message, logTail });
    await setProjectStatus(project.id, "failed");
    await failDeployJob(jobId, message, sandboxSeconds);
    await logStep(jobId, "failed", message);
    if (logTail && logTail !== message) {
      await appendDeployJobLog(jobId, logTail);
    }
  } finally {
    if (handleId && sandboxProvider) {
      try {
        await sandboxProvider.kill(handleId);
      } catch {
        // already killed
      }
    }
    if (tempDistDir) {
      await rm(tempDistDir, { recursive: true, force: true });
    }
  }
}
