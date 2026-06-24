import { getInngestConfig } from "../../config/inngest.js";
import { inngest } from "../../inngest/client.js";
import {
  LIFI_TRACK_CROSS_CHAIN_EVENT,
  LIFI_TRACK_SWAP_EVENT,
} from "../../inngest/events.js";
import { logger } from "../../shared/logger.js";
import { startLocalLifiTrackingPoll } from "../../services/defi/lifi/lifi-status-tracker.service.js";
import type { LifiTrackJobInput } from "../../services/defi/lifi/lifi-tracking.types.js";

async function sendLifiTrackingEvent(
  eventName: typeof LIFI_TRACK_CROSS_CHAIN_EVENT | typeof LIFI_TRACK_SWAP_EVENT,
  input: LifiTrackJobInput,
  logLabel: string,
): Promise<void> {
  const config = getInngestConfig();
  if (config.enabled) {
    await inngest.send({
      name: eventName,
      data: input,
      id: `lifi-track-${input.transactionId}`,
    });
    logger.info(`Queued Li-Fi ${logLabel} tracking via Inngest`, {
      transactionId: input.transactionId,
    });
    return;
  }

  startLocalLifiTrackingPoll(input);
  logger.info(`Started in-process Li-Fi ${logLabel} tracking poll`, {
    transactionId: input.transactionId,
  });
}

export async function enqueueLifiCrossChainTrackingJob(
  input: LifiTrackJobInput,
): Promise<void> {
  await sendLifiTrackingEvent(LIFI_TRACK_CROSS_CHAIN_EVENT, input, "cross-chain");
}

export async function enqueueLifiSwapTrackingJob(input: LifiTrackJobInput): Promise<void> {
  await sendLifiTrackingEvent(LIFI_TRACK_SWAP_EVENT, input, "swap");
}
