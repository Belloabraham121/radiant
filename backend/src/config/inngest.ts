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
}
