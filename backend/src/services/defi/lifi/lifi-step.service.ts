import type { LiFiStep } from "@lifi/types";
import { isLifiEnabled } from "../../../config/lifi.js";
import { AppError } from "../../../errors/app-error.js";
import { lifiSdk } from "./lifi.client.js";
import { consumeLifiOutboundQuota } from "./lifi-rate-limit.js";

export async function getLifiStepTransaction(
  userId: string,
  step: LiFiStep,
): Promise<LiFiStep> {
  if (!isLifiEnabled()) {
    throw new AppError(503, "LIFI_UNAVAILABLE", "Li-Fi is not enabled on this deployment.");
  }

  await consumeLifiOutboundQuota(userId);
  return lifiSdk.getStepTransaction(step);
}
