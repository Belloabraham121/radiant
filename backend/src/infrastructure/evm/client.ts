import {
  type Chain,
  type Hex,
  type PublicClient,
  type WalletClient,
  createPublicClient,
  createWalletClient,
  defineChain,
  http,
} from "viem";
import type { LocalAccount } from "viem/accounts";
import { getEvmNetwork, type EvmNetworkConfig } from "../../config/evm.js";
import { AppError } from "../../errors/app-error.js";

const chainCache = new Map<number, Chain>();
const publicClientCache = new Map<number, PublicClient>();

function toViemChain(network: EvmNetworkConfig): Chain {
  const cached = chainCache.get(network.chainId);
  if (cached) {
    return cached;
  }

  const chain = defineChain({
    id: network.chainId,
    name: network.name,
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    rpcUrls: {
      default: { http: [network.rpcUrl] },
    },
  });

  chainCache.set(network.chainId, chain);
  return chain;
}

export function getEvmPublicClient(chainId: number): PublicClient {
  const cached = publicClientCache.get(chainId);
  if (cached) {
    return cached;
  }

  const network = getEvmNetwork(chainId);
  if (!network) {
    throw new AppError(
      400,
      "EVM_CHAIN_NOT_CONFIGURED",
      `EVM chain ${chainId} is not configured`,
    );
  }

  const client = createPublicClient({
    chain: toViemChain(network),
    transport: http(network.rpcUrl),
  });

  publicClientCache.set(chainId, client);
  return client;
}

export function createEvmWalletClient(
  chainId: number,
  account: LocalAccount,
): WalletClient {
  const network = getEvmNetwork(chainId);
  if (!network) {
    throw new AppError(
      400,
      "EVM_CHAIN_NOT_CONFIGURED",
      `EVM chain ${chainId} is not configured`,
    );
  }

  return createWalletClient({
    account,
    chain: toViemChain(network),
    transport: http(network.rpcUrl),
  });
}

export type EvmAddress = Hex;

/** Test hook — clear viem client caches between tests. */
export function resetEvmClientCacheForTests(): void {
  chainCache.clear();
  publicClientCache.clear();
}
