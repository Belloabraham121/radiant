import { getInngestConfig } from "../../config/inngest.js";
import { inngest } from "../../inngest/client.js";
import { DEPLOY_REQUESTED_EVENT } from "../../inngest/events.js";
import { logger } from "../../shared/logger.js";

export async function enqueueDeployJobViaInngest(jobId: string): Promise<void> {
  const config = getInngestConfig();
  if (!config.enabled) {
    throw new Error("Inngest is not configured");
  }

  await inngest.send({
    name: DEPLOY_REQUESTED_EVENT,
    data: { jobId },
    id: `deploy-${jobId}`,
  });

  logger.info("Deploy job enqueued via Inngest", { jobId, event: DEPLOY_REQUESTED_EVENT });
}
