import { getSquidConfig } from "../../../config/squid.js";

export const DEFAULT_SQUID_TIMEOUT_MS = 30_000;

export function buildSquidSdkConfig() {
  const config = getSquidConfig();
  return {
    baseUrl: config.apiBaseUrl,
    integratorId: config.integratorId,
    timeout: DEFAULT_SQUID_TIMEOUT_MS,
  };
}
