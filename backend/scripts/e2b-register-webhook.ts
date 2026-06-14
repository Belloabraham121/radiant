import { config } from "dotenv";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { getE2bWebhookConfig } from "../src/config/e2b.js";

const here = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(here, "../.env") });

const E2B_API_KEY = process.env.E2B_API_KEY;
const WEBHOOK_URL = process.env.E2B_WEBHOOK_URL;
const SIGNATURE_SECRET = process.env.E2B_WEBHOOK_SIGNATURE_SECRET;

async function main() {
  if (!E2B_API_KEY) {
    console.error("E2B_API_KEY is required.");
    process.exit(1);
  }
  if (!WEBHOOK_URL) {
    console.error("E2B_WEBHOOK_URL is required (public URL for POST /api/v1/webhooks/e2b).");
    process.exit(1);
  }
  if (!SIGNATURE_SECRET) {
    console.error("E2B_WEBHOOK_SIGNATURE_SECRET is required.");
    process.exit(1);
  }

  const { eventsApiBaseUrl } = getE2bWebhookConfig();
  const events = [
    "sandbox.lifecycle.killed",
    "sandbox.lifecycle.paused",
    "sandbox.lifecycle.created",
  ];

  const resp = await fetch(`${eventsApiBaseUrl}/events/webhooks`, {
    method: "POST",
    headers: {
      "X-API-Key": E2B_API_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name: "Radiant deploy lifecycle",
      url: WEBHOOK_URL,
      enabled: true,
      events,
      signatureSecret: SIGNATURE_SECRET,
    }),
  });

  const body = await resp.text();
  if (!resp.ok) {
    console.error(`Webhook registration failed (${resp.status}):`, body);
    process.exit(1);
  }

  console.log("E2B lifecycle webhook registered:");
  console.log(body);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
