import type { WalrusConfig } from "../../config/walrus.js";

/** CLI flags shared by site-builder publish/update/convert. */
export function siteBuilderGlobalArgs(config: WalrusConfig): string[] {
  const args: string[] = [];

  if (config.sitesConfigPath) {
    args.push("--config", config.sitesConfigPath);
  }
  if (config.walrusConfigPath) {
    args.push("--walrus-config", config.walrusConfigPath);
  }
  if (config.suiNetwork === "testnet") {
    args.push("--context", "testnet");
  } else if (config.suiNetwork === "mainnet") {
    args.push("--context", "mainnet");
  }

  return args;
}
