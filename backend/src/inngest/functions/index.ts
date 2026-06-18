import { deployPipelineFunction } from "./deploy-pipeline.js";
import { notificationDeliverFunction } from "./notification-deliver.js";
import { notificationEvaluatePollFunction } from "./notification-evaluate-poll.js";
import { notificationEvaluateScheduleFunction } from "./notification-evaluate-schedule.js";
import { notificationScheduleOnceFunction } from "./notification-schedule-once.js";

export const inngestFunctions = [
  deployPipelineFunction,
  notificationDeliverFunction,
  notificationEvaluatePollFunction,
  notificationEvaluateScheduleFunction,
  notificationScheduleOnceFunction,
];
