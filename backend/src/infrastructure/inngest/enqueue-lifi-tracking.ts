import { getInngestConfig } from "../../config/inngest.js";
import { inngest } from "../../inngest/client.js";
import { LIFI_TRACK_CROSS_CHAIN_EVENT } from "../../inngest/events.js";
import { logger } from "../../shared/logger.js";
import { startLocalLifiTrackingPoll } from "../../services/defi/lifi/lifi-status-tracker.service.js";
import type { LifiTrackJobInput } from "../../services/defi/lifi/lifi-tracking.types.js";

export async function enqueueLifiTrackingJob(input: LifiTrackJobInput): Promise<void> {
  const config = getInngestConfig();
  if (config.enabled) {
    await inngest.send({
      name: LIFI_TRACK_CROSS_CHAIN_EVENT,
      data: input,
      id: `lifi-track-${input.transactionId}`,
    });
    logger.info("Queued Li-Fi cross-chain tracking via Inngest", {
      transactionId: input.transactionId,
    });
    return;
  }

  startLocalLifiTrackingPoll(input);
  logger.info("Started in-process Li-Fi cross-chain tracking poll", {
    transactionId: input.transactionId,
  });
}
