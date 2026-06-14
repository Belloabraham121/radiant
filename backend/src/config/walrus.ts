import { homedir } from "node:os";
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

function defaultPortalBaseUrl(network: string): string {
  return network === "mainnet" ? "https://wal.app" : "http://localhost:3000";
}

/** Expand `$HOME` / `~` in env paths — dotenv does not shell-expand. */
export function expandWalrusConfigPath(path: string | undefined): string | undefined {
  const trimmed = path?.trim();
  if (!trimmed) return undefined;
  return trimmed.replace(/^\$HOME\b/, homedir()).replace(/^~(?=\/|$)/, homedir());
}

export function getWalrusConfig(): WalrusConfig {
  if (cached) return cached;

  const suiNetwork = optional("WALRUS_SUI_NETWORK", optional("SUI_NETWORK", "testnet"));

  cached = {
    mockDeploy: parseBool(optional("WALRUS_DEPLOY_MOCK", "true"), true),
    siteBuilderBin: optional("WALRUS_SITE_BUILDER_BIN", "site-builder"),
    epochs: optional("WALRUS_SITE_EPOCHS", "30"),
    sitesConfigPath: expandWalrusConfigPath(process.env.WALRUS_SITES_CONFIG_PATH),
    walrusConfigPath: expandWalrusConfigPath(process.env.WALRUS_CONFIG_PATH),
    suiNetwork,
    portalBaseUrl: optional("WALRUS_PORTAL_BASE_URL", defaultPortalBaseUrl(suiNetwork)),
  };

  return cached;
}

export function resetWalrusConfigForTests(): void {
  cached = undefined;
}
