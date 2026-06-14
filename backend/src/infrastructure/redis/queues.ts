import { Queue, Worker, type ConnectionOptions } from "bullmq";
import { getDeployConfig } from "../../config/deploy.js";
import { useInngestDeployQueue } from "../../config/inngest.js";
import { enqueueDeployJobViaInngest } from "../inngest/enqueue-deploy.js";
import { getRedisClient } from "./client.js";
import { DEPLOY_QUEUE_NAME, type DeployQueuePayload } from "../../services/deploy/job-types.js";
import { runDeployPipeline } from "../../services/deploy/pipeline.js";
import { logger } from "../../shared/logger.js";

let deployQueue: Queue<DeployQueuePayload> | undefined;

function redisConnection(): ConnectionOptions | null {
  const redis = getRedisClient();
  if (!redis) return null;
  return redis as unknown as ConnectionOptions;
}

export function getDeployQueue(): Queue<DeployQueuePayload> | null {
  const connection = redisConnection();
  if (!connection) return null;

  if (!deployQueue) {
    deployQueue = new Queue<DeployQueuePayload>(DEPLOY_QUEUE_NAME, { connection });
  }

  return deployQueue;
}

export async function enqueueDeployJob(jobId: string): Promise<void> {
  if (useInngestDeployQueue()) {
    await enqueueDeployJobViaInngest(jobId);
    return;
  }

  const queue = getDeployQueue();
  if (queue) {
    await queue.add("deploy", { jobId }, {
      jobId,
      removeOnComplete: 100,
      removeOnFail: 200,
    });
    return;
  }

  setImmediate(() => {
    runDeployPipeline(jobId).catch((error) => {
      logger.error("In-process deploy pipeline failed", {
        jobId,
        message: error instanceof Error ? error.message : String(error),
      });
    });
  });
}

export function startDeployWorker(): Worker<DeployQueuePayload> | null {
  const connection = redisConnection();
  if (!connection) return null;

  const { maxConcurrent, jobTimeoutMs } = getDeployConfig();

  const worker = new Worker<DeployQueuePayload>(
    DEPLOY_QUEUE_NAME,
    async (job) => {
      await runDeployPipeline(job.data.jobId);
    },
    {
      connection,
      concurrency: maxConcurrent,
      limiter: { max: 1, duration: 1000 },
      lockDuration: jobTimeoutMs,
    },
  );

  worker.on("failed", (job, error) => {
    logger.error("Deploy worker job failed", {
      jobId: job?.data.jobId,
      message: error.message,
    });
  });

  return worker;
}
