import { getInngestConfig } from "../../config/inngest.js";
import { inngest } from "../../inngest/client.js";
import { SQUID_TRACK_CROSS_CHAIN_EVENT } from "../../inngest/events.js";
import { logger } from "../../shared/logger.js";
import { startLocalSquidTrackingPoll } from "../../services/defi/squid/squid-status-tracker.service.js";
import type { SquidTrackJobInput } from "../../services/defi/squid/squid-tracking.types.js";

export async function enqueueSquidCrossChainTrackingJob(
  input: SquidTrackJobInput,
): Promise<void> {
  const config = getInngestConfig();
  if (config.enabled) {
    await inngest.send({
      name: SQUID_TRACK_CROSS_CHAIN_EVENT,
      data: input,
      id: `squid-track-${input.transactionId}`,
    });
    logger.info("Queued Squid cross-chain tracking via Inngest", {
      transactionId: input.transactionId,
    });
    return;
  }

  startLocalSquidTrackingPoll(input);
  logger.info("Started in-process Squid cross-chain tracking poll", {
    transactionId: input.transactionId,
  });
}
