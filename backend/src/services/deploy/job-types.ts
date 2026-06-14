export const DEPLOY_QUEUE_NAME = "radiant:deploy" as const;

export type DeployPipelineStep =
  | "queued"
  | "load"
  | "sandbox"
  | "build"
  | "finalize"
  | "done"
  | "failed";

export const DEPLOY_PROGRESS_PCT: Record<DeployPipelineStep, number> = {
  queued: 0,
  load: 5,
  sandbox: 10,
  build: 55,
  finalize: 90,
  done: 100,
  failed: 0,
};

export type DeployQueuePayload = {
  jobId: string;
};

export type DeployJobView = {
  id: string;
  project_id: string;
  status: string;
  provider: string;
  progress_pct: number;
  sandbox_id: string | null;
  sandbox_seconds: number | null;
  logs_tail: string;
  error_message: string | null;
  walrus_url: string | null;
  artifact_revision: number;
  started_at: string | null;
  finished_at: string | null;
  created_at: string;
};

export type StartDeployResult = {
  job_id: string;
  status: string;
  provider: string;
};
