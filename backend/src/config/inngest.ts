import { optional } from "./optional-env.js";

export type InngestConfig = {
  enabled: boolean;
  appId: string;
  eventKey?: string;
  signingKey?: string;
  dev: boolean;
  baseUrl?: string;
};

let cached: InngestConfig | undefined;

function parseQueueProvider(): "inngest" | "bullmq" | "auto" {
  const raw = optional("DEPLOY_QUEUE_PROVIDER", "auto").toLowerCase();
  if (raw === "inngest" || raw === "bullmq") return raw;
  return "auto";
}

/** True when deploy jobs should be sent via Inngest instead of BullMQ. */
export function useInngestDeployQueue(): boolean {
  const provider = parseQueueProvider();
  if (provider === "bullmq") return false;
  if (provider === "inngest") return true;

  const cfg = getInngestConfig();
  return cfg.enabled;
}

export function getInngestConfig(): InngestConfig {
  if (cached) return cached;

  const dev = optional("INNGEST_DEV", "0") === "1";
  const eventKey = process.env.INNGEST_EVENT_KEY?.trim() || undefined;
  const signingKey = process.env.INNGEST_SIGNING_KEY?.trim() || undefined;
  const baseUrl = process.env.INNGEST_BASE_URL?.trim() || undefined;

  const enabled =
    dev ||
    Boolean(eventKey && signingKey) ||
    parseQueueProvider() === "inngest";

  cached = {
    enabled,
    appId: optional("INNGEST_APP_ID", "radiant-backend"),
    eventKey,
    signingKey,
    dev,
    baseUrl,
  };

  return cached;
}

export function resetInngestConfigForTests(): void {
  cached = undefined;
  cachedNetworkEnv = undefined;
}

/**
 * Network ACL for POST /api/inngest.
 *
 * Set `INNGEST_ALLOWED_IPS` to a comma-separated list of caller IPs or CIDR-less
 * host IPs allowed to reach the serve endpoint. Use `127.0.0.1,::1` for local
 * Inngest Dev Server. In production with Inngest enabled, an allowlist is required.
 *
 * Inngest Cloud egress IPs: configure from your Inngest dashboard / support docs
 * for the region where your app runs.
 */
export type InngestNetworkEnv = {
  allowedIps: string[];
  requireAllowlist: boolean;
};

let cachedNetworkEnv: InngestNetworkEnv | undefined;

export function getInngestNetworkEnv(): InngestNetworkEnv {
  if (cachedNetworkEnv) return cachedNetworkEnv;

  const raw = optional("INNGEST_ALLOWED_IPS", "");
  const allowedIps = raw
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);

  const inngestEnabled = getInngestConfig().enabled;
  const isProduction = optional("NODE_ENV", "development") === "production";
  const dev = optional("INNGEST_DEV", "0") === "1";

  cachedNetworkEnv = {
    allowedIps,
    requireAllowlist: inngestEnabled && isProduction && !dev,
  };

  return cachedNetworkEnv;
}

export function resetInngestNetworkEnvForTests(): void {
  cachedNetworkEnv = undefined;
}
