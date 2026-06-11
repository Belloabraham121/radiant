import { PrivyClient } from "@privy-io/node";
import { getPrivyEnv } from "../../config/env.js";

let client: PrivyClient | undefined;

export function getPrivyClient(): PrivyClient {
  if (!client) {
    const { PRIVY_APP_ID, PRIVY_APP_SECRET, PRIVY_WEBHOOK_SIGNING_SECRET } = getPrivyEnv();
    client = new PrivyClient({
      appId: PRIVY_APP_ID,
      appSecret: PRIVY_APP_SECRET,
      webhookSigningSecret: PRIVY_WEBHOOK_SIGNING_SECRET,
    });
  }
  return client;
}

/** Test hook — replace the singleton Privy client. */
export function setPrivyClientForTests(mock: PrivyClient | undefined): void {
  client = mock;
}
