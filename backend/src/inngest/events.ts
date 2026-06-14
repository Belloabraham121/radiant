/** Deploy pipeline job queued from POST /api/v1/deploy. */
export const DEPLOY_REQUESTED_EVENT = "radiant/deploy.requested" as const;

export type DeployRequestedEvent = {
  name: typeof DEPLOY_REQUESTED_EVENT;
  data: {
    jobId: string;
  };
};
