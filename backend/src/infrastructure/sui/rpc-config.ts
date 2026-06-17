import type { SuiClientTypes } from "@mysten/sui/client";
import { getPrivyWalletEnv } from "../../config/privy.js";

function envOptional(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value && value.length > 0 ? value : undefined;
}

export type SuiRpcConnection =
  | {
      mode: "grpc-web";
      network: SuiClientTypes.Network;
      baseUrl: string;
      apiKey?: string;
    }
  | {
      mode: "json-rpc";
      network: SuiClientTypes.Network;
      /** Full HTTP JSON-RPC URL (e.g. Alchemy `.../v2/<key>`). */
      url: string;
    };

function bearerAuthFetch(apiKey: string): typeof fetch {
  return (input, init) => {
    const headers = new Headers(init?.headers);
    if (!headers.has("Authorization")) {
      headers.set("Authorization", `Bearer ${apiKey}`);
    }
    return globalThis.fetch(input, { ...init, headers });
  };
}

function networkFromHost(host: string): SuiClientTypes.Network {
  if (host.includes("testnet")) return "testnet";
  if (host.includes("devnet")) return "devnet";
  return "mainnet";
}

function grpcBaseUrlFromHost(host: string, protocol = "https"): string {
  const normalizedHost = host.replace(/\/$/, "");
  if (normalizedHost.includes(":443") || normalizedHost.includes(":9000")) {
    return `${protocol}://${normalizedHost}`;
  }
  return `${protocol}://${normalizedHost}:443`;
}

function parseRpcUrl(raw: string): URL {
  const trimmed = raw.trim();
  return new URL(trimmed.includes("://") ? trimmed : `https://${trimmed}`);
}

/** Provider HTTP URLs embed the API key in `/v2/<key>` and must use JSON-RPC, not gRPC-web. */
function isProviderJsonRpcUrl(parsed: URL): boolean {
  return /^\/v2\/[^/]+/.test(parsed.pathname);
}

function resolveApiKey(parsed: URL): string | undefined {
  return envOptional("SUI_RPC_API_KEY") ?? parsed.pathname.match(/^\/v2\/([^/]+)/)?.[1];
}

/** Resolve Sui RPC settings from SUI_RPC_URL (and optional SUI_RPC_API_KEY). */
export function resolveSuiRpcConnection(): SuiRpcConnection {
  const { SUI_RPC_URL } = getPrivyWalletEnv();
  const parsed = parseRpcUrl(SUI_RPC_URL);
  const network = networkFromHost(parsed.hostname);

  if (isProviderJsonRpcUrl(parsed)) {
    return {
      mode: "json-rpc",
      network,
      url: SUI_RPC_URL.trim().replace(/\/$/, ""),
    };
  }

  const apiKey = resolveApiKey(parsed);
  const trimmed = SUI_RPC_URL.trim().replace(/\/$/, "");

  if (/^https?:\/\/[^/]+:\d+$/.test(trimmed)) {
    return {
      mode: "grpc-web",
      network,
      baseUrl: trimmed,
      apiKey,
    };
  }

  return {
    mode: "grpc-web",
    network,
    baseUrl: grpcBaseUrlFromHost(parsed.hostname, parsed.protocol.replace(":", "") || "https"),
    apiKey,
  };
}

export { bearerAuthFetch };
