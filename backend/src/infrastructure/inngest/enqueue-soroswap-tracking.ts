import { getInngestConfig } from "../../config/inngest.js";
import { inngest } from "../../inngest/client.js";
import { SOROSWAP_TRACK_SWAP_EVENT } from "../../inngest/events.js";
import { logger } from "../../shared/logger.js";
import { startLocalSoroswapTrackingPoll } from "../../services/defi/soroswap/soroswap-status-tracker.service.js";
import type { SoroswapTrackJobInput } from "../../services/defi/soroswap/soroswap-tracking.types.js";

export async function enqueueSoroswapSwapTrackingJob(
  input: SoroswapTrackJobInput,
): Promise<void> {
  const config = getInngestConfig();
  if (config.enabled) {
    await inngest.send({
      name: SOROSWAP_TRACK_SWAP_EVENT,
      data: input,
      id: `soroswap-track-${input.transactionId}`,
    });
    logger.info("Queued Soroswap swap tracking via Inngest", {
      transactionId: input.transactionId,
    });
    return;
  }

  startLocalSoroswapTrackingPoll(input);
  logger.info("Started in-process Soroswap swap tracking poll", {
    transactionId: input.transactionId,
  });
}
