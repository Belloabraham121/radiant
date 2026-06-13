import { optional } from "./optional-env.js";

export type WalrusConfig = {
  /** When true, skip site-builder and return a synthetic *.walrus.site URL. */
  mockDeploy: boolean;
  siteBuilderBin: string;
  epochs: string;
  sitesConfigPath: string | undefined;
  walrusConfigPath: string | undefined;
  suiNetwork: string;
  portalBaseUrl: string;
};

let cached: WalrusConfig | undefined;

function parseBool(raw: string, fallback: boolean): boolean {
  const normalized = raw.trim().toLowerCase();
  if (normalized === "true" || normalized === "1") return true;
  if (normalized === "false" || normalized === "0") return false;
  return fallback;
}

export function getWalrusConfig(): WalrusConfig {
  if (cached) return cached;

  cached = {
    mockDeploy: parseBool(optional("WALRUS_DEPLOY_MOCK", "true"), true),
    siteBuilderBin: optional("WALRUS_SITE_BUILDER_BIN", "site-builder"),
    epochs: optional("WALRUS_SITE_EPOCHS", "5"),
    sitesConfigPath: process.env.WALRUS_SITES_CONFIG_PATH?.trim() || undefined,
    walrusConfigPath: process.env.WALRUS_CONFIG_PATH?.trim() || undefined,
    suiNetwork: optional("WALRUS_SUI_NETWORK", optional("SUI_NETWORK", "testnet")),
    portalBaseUrl: optional("WALRUS_PORTAL_BASE_URL", "https://wal.app"),
  };

  return cached;
}

export function resetWalrusConfigForTests(): void {
  cached = undefined;
}
