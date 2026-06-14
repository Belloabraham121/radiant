import { optional } from "./optional-env.js";

export type DeployConfig = {
  maxConcurrent: number;
  maxPerUserPerHour: number;
  jobTimeoutMs: number;
  idempotencyTtlSeconds: number;
};

let cached: DeployConfig | undefined;

function parsePositiveInt(raw: string, fallback: number): number {
  const value = Number.parseInt(raw, 10);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

export function getDeployConfig(): DeployConfig {
  if (cached) return cached;

  cached = {
    maxConcurrent: parsePositiveInt(optional("DEPLOY_MAX_CONCURRENT", "2"), 2),
    maxPerUserPerHour: parsePositiveInt(optional("DEPLOY_MAX_PER_USER_PER_HOUR", "5"), 5),
    jobTimeoutMs: parsePositiveInt(optional("DEPLOY_JOB_TIMEOUT_MS", "900000"), 900_000),
    idempotencyTtlSeconds: parsePositiveInt(optional("DEPLOY_IDEMPOTENCY_TTL_SECONDS", "3600"), 3600),
  };

  return cached;
}

export function resetDeployConfigForTests(): void {
  cached = undefined;
}
