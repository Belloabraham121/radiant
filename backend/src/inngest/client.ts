import { Inngest } from "inngest";
import { getInngestConfig } from "../config/inngest.js";

const config = getInngestConfig();

export const inngest = new Inngest({
  id: config.appId,
  ...(config.eventKey ? { eventKey: config.eventKey } : {}),
  ...(config.signingKey ? { signingKey: config.signingKey } : {}),
  ...(config.baseUrl ? { baseUrl: config.baseUrl } : {}),
});
