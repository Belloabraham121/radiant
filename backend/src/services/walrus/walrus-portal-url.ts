import { spawn } from "node:child_process";
import type { WalrusConfig } from "../../config/walrus.js";
import { siteBuilderGlobalArgs } from "./site-builder-args.js";

const PORTAL_URL_FROM_OUTPUT =
  /https?:\/\/[a-z0-9]+\.(?:localhost:\d+|wal\.app)\/?/i;

/** Mock deploy URLs — random hex subdomain, not on-chain. */
export function isMockWalrusSiteUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  return /^https:\/\/[a-f0-9]{32}\.walrus\.site\/?$/i.test(url);
}

export function parsePortalUrlFromSiteBuilderOutput(stdout: string): string | null {
  const forLocal = stdout.match(/For local development:\s*(https?:\/\/[^\s]+)/i);
  if (forLocal?.[1]) return forLocal[1].replace(/\/$/, "");

  const match = stdout.match(PORTAL_URL_FROM_OUTPUT);
  return match?.[0]?.replace(/\/$/, "") ?? null;
}

/** Build portal URL from base36 site id (testnet local or wal.app mainnet). */
export function buildPortalUrlFromBase36(base36Id: string, portalBaseUrl: string): string {
  const trimmed = base36Id.trim().toLowerCase();
  const base = portalBaseUrl.replace(/\/$/, "");

  try {
    const parsed = new URL(base);
    if (parsed.hostname === "localhost" || parsed.hostname.endsWith(".localhost")) {
      const port = parsed.port ? `:${parsed.port}` : "";
      return `${parsed.protocol}//${trimmed}.localhost${port}`;
    }
    if (parsed.hostname === "wal.app" || parsed.hostname.endsWith(".wal.app")) {
      return `https://${trimmed}.wal.app`;
    }
    return `${parsed.protocol}//${trimmed}.${parsed.host}`;
  } catch {
    return `${base}/${trimmed}`;
  }
}

export async function convertSiteObjectIdToBase36(
  siteObjectId: string,
  config: WalrusConfig,
): Promise<string | null> {
  const args = [...siteBuilderGlobalArgs(config), "convert", siteObjectId];

  const stdout = await new Promise<string>((resolve, reject) => {
    const child = spawn(config.siteBuilderBin, args, {
      stdio: ["ignore", "pipe", "pipe"],
    });

    let out = "";
    let err = "";

    child.stdout.on("data", (chunk: Buffer) => {
      out += chunk.toString("utf8");
    });
    child.stderr.on("data", (chunk: Buffer) => {
      err += chunk.toString("utf8");
    });

    child.on("error", (error) => reject(error));
    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(err || out || `site-builder convert exited ${code}`));
        return;
      }
      resolve(out + err);
    });
  });

  const token = stdout.trim().split(/\s+/).pop();
  return token && /^[a-z0-9]+$/i.test(token) ? token.toLowerCase() : null;
}

export async function resolveWalrusPortalUrl(
  stdout: string,
  siteObjectId: string | null,
  config: WalrusConfig,
): Promise<string | null> {
  const fromOutput = parsePortalUrlFromSiteBuilderOutput(stdout);
  if (fromOutput) return fromOutput;

  if (!siteObjectId) return null;

  try {
    const base36 = await convertSiteObjectIdToBase36(siteObjectId, config);
    if (base36) {
      return buildPortalUrlFromBase36(base36, config.portalBaseUrl);
    }
  } catch {
    // fall through
  }

  return null;
}
