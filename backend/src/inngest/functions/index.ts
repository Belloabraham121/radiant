import { deployPipelineFunction } from "./deploy-pipeline.js";
import { notificationDeliverFunction } from "./notification-deliver.js";
import { notificationEvaluatePollFunction } from "./notification-evaluate-poll.js";

export const inngestFunctions = [
  deployPipelineFunction,
  notificationDeliverFunction,
  notificationEvaluatePollFunction,
];
