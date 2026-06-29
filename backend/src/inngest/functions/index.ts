import { lifiTrackCrossChainFunction } from "./lifi-track-cross-chain.js";
import { lifiTrackSwapFunction } from "./lifi-track-swap.js";
import { soroswapTrackSwapFunction } from "./soroswap-track-swap.js";
import { squidTrackCrossChainFunction } from "./squid-track-cross-chain.js";
import { notificationDeliverFunction } from "./notification-deliver.js";
import { notificationEvaluatePollFunction } from "./notification-evaluate-poll.js";
import { notificationEvaluateScheduleFunction } from "./notification-evaluate-schedule.js";
import { notificationScheduleOnceFunction } from "./notification-schedule-once.js";
import { canvasFeeCollectFunction } from "./canvas-fee-collect.js";
import { canvasCronTriggerFunction } from "./canvas-cron-trigger.js";

export const inngestFunctions = [
  lifiTrackCrossChainFunction,
  lifiTrackSwapFunction,
  soroswapTrackSwapFunction,
  squidTrackCrossChainFunction,
  notificationDeliverFunction,
  notificationEvaluatePollFunction,
  notificationEvaluateScheduleFunction,
  notificationScheduleOnceFunction,
  canvasFeeCollectFunction,
  canvasCronTriggerFunction,
];
