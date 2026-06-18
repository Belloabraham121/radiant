import { deployPipelineFunction } from "./deploy-pipeline.js";
import { notificationDeliverFunction } from "./notification-deliver.js";

export const inngestFunctions = [deployPipelineFunction, notificationDeliverFunction];
