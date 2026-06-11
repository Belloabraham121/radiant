import { SuiGrpcClient } from "@mysten/sui/grpc";
import type { SuiClientTypes } from "@mysten/sui/client";
import { getPrivyWalletEnv } from "../../config/privy.js";

let client: SuiGrpcClient | undefined;

function resolveSuiNetwork(rpcUrl: string): SuiClientTypes.Network {
  if (rpcUrl.includes("testnet")) return "testnet";
  if (rpcUrl.includes("devnet")) return "devnet";
  return "mainnet";
}

function normalizeGrpcBaseUrl(rpcUrl: string): string {
  if (rpcUrl.includes(":443") || rpcUrl.includes(":9000")) {
    return rpcUrl;
  }
  return `${rpcUrl.replace(/\/$/, "")}:443`;
}

export function getSuiClient(): SuiGrpcClient {
  if (!client) {
    const { SUI_RPC_URL } = getPrivyWalletEnv();
    client = new SuiGrpcClient({
      network: resolveSuiNetwork(SUI_RPC_URL),
      baseUrl: normalizeGrpcBaseUrl(SUI_RPC_URL),
    });
  }
  return client;
}
