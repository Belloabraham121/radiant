import { optional } from "./optional-env.js";

export type E2bWebhookConfig = {
  signatureSecret: string | undefined;
  eventsApiBaseUrl: string;
};

let cached: E2bWebhookConfig | undefined;

export function getE2bWebhookConfig(): E2bWebhookConfig {
  if (cached) return cached;

  cached = {
    signatureSecret: process.env.E2B_WEBHOOK_SIGNATURE_SECRET?.trim() || undefined,
    eventsApiBaseUrl: optional("E2B_EVENTS_API_URL", "https://api.e2b.app"),
  };

  return cached;
}

export function resetE2bWebhookConfigForTests(): void {
  cached = undefined;
}
