import { deployPipelineFunction } from "./deploy-pipeline.js";
import { lifiTrackCrossChainFunction } from "./lifi-track-cross-chain.js";
import { notificationDeliverFunction } from "./notification-deliver.js";
import { notificationEvaluatePollFunction } from "./notification-evaluate-poll.js";
import { notificationEvaluateScheduleFunction } from "./notification-evaluate-schedule.js";
import { notificationScheduleOnceFunction } from "./notification-schedule-once.js";

export const inngestFunctions = [
  deployPipelineFunction,
  lifiTrackCrossChainFunction,
  notificationDeliverFunction,
  notificationEvaluatePollFunction,
  notificationEvaluateScheduleFunction,
  notificationScheduleOnceFunction,
];
