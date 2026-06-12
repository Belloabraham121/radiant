import { z } from "zod";
import { AppError } from "../errors/app-error.js";

function optional(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value && value.length > 0 ? value : undefined;
}

/** Well-known EVM networks — RPC can be overridden per chain via env. */
const EVM_CHAIN_DEFAULTS: Record<number, { name: string; rpcUrl: string }> = {
  1: { name: "Ethereum", rpcUrl: "https://eth.llamarpc.com" },
  8453: { name: "Base", rpcUrl: "https://mainnet.base.org" },
  137: { name: "Polygon", rpcUrl: "https://polygon-rpc.com" },
  42161: { name: "Arbitrum One", rpcUrl: "https://arb1.arbitrum.io/rpc" },
  10: { name: "Optimism", rpcUrl: "https://mainnet.optimism.io" },
};

export type EvmNetworkConfig = {
  chainId: number;
  name: string;
  rpcUrl: string;
};

const evmEnvSchema = z.object({
  EVM_CHAIN_IDS: z.string().optional(),
  EVM_DEFAULT_CHAIN_ID: z.coerce.number().int().positive().optional(),
  EVM_RPC_URL: z.string().url().optional(),
});

type EvmEnv = z.infer<typeof evmEnvSchema>;

let cachedEvmEnv: EvmEnv | undefined;
let cachedNetworks: EvmNetworkConfig[] | undefined;

function getEvmEnv(): EvmEnv {
  if (!cachedEvmEnv) {
    cachedEvmEnv = evmEnvSchema.parse({
      EVM_CHAIN_IDS: optional("EVM_CHAIN_IDS"),
      EVM_DEFAULT_CHAIN_ID: optional("EVM_DEFAULT_CHAIN_ID"),
      EVM_RPC_URL: optional("EVM_RPC_URL"),
    });
  }
  return cachedEvmEnv;
}

function rpcUrlForChain(chainId: number, env: EvmEnv): string {
  const perChain = optional(`EVM_RPC_URL_${chainId}`);
  if (perChain) {
    return perChain;
  }

  const defaults = EVM_CHAIN_DEFAULTS[chainId];
  const defaultChainId = env.EVM_DEFAULT_CHAIN_ID ?? 1;
  if (defaults) {
    if (chainId === defaultChainId && env.EVM_RPC_URL) {
      return env.EVM_RPC_URL;
    }
    return defaults.rpcUrl;
  }

  if (env.EVM_RPC_URL) {
    return env.EVM_RPC_URL;
  }

  throw new AppError(
    500,
    "EVM_RPC_NOT_CONFIGURED",
    `No RPC URL for EVM chain ${chainId}. Set EVM_RPC_URL_${chainId} or EVM_RPC_URL.`,
  );
}

function getDefaultEvmChainIdFromEnv(env: EvmEnv): number {
  return env.EVM_DEFAULT_CHAIN_ID ?? 1;
}

function parseEvmChainIds(env: EvmEnv): number[] {
  const raw = env.EVM_CHAIN_IDS;
  if (!raw) {
    return [getDefaultEvmChainIdFromEnv(env)];
  }

  const ids = raw
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
    .map((part) => Number.parseInt(part, 10))
    .filter((id) => Number.isInteger(id) && id > 0);

  return ids.length > 0 ? ids : [getDefaultEvmChainIdFromEnv(env)];
}

function buildNetworks(): EvmNetworkConfig[] {
  const env = getEvmEnv();
  const chainIds = parseEvmChainIds(env);

  return chainIds.map((chainId) => {
    const defaults = EVM_CHAIN_DEFAULTS[chainId];
    return {
      chainId,
      name: defaults?.name ?? `EVM ${chainId}`,
      rpcUrl: rpcUrlForChain(chainId, env),
    };
  });
}

/** Configured EVM networks (same agent `0x` address on each). */
export function getEvmNetworks(): EvmNetworkConfig[] {
  if (!cachedNetworks) {
    cachedNetworks = buildNetworks();
  }
  return cachedNetworks;
}

export function getEvmNetwork(chainId: number): EvmNetworkConfig | null {
  return getEvmNetworks().find((network) => network.chainId === chainId) ?? null;
}

/** Default EVM chain for balance/tx when `evm_chain_id` is omitted. */
export function getDefaultEvmChainId(): number {
  const preferred = getDefaultEvmChainIdFromEnv(getEvmEnv());
  const networks = getEvmNetworks();
  if (networks.some((network) => network.chainId === preferred)) {
    return preferred;
  }
  return networks[0]?.chainId ?? 1;
}

export function resolveEvmChainId(chainId?: number): number {
  if (chainId === undefined) {
    return getDefaultEvmChainId();
  }

  const network = getEvmNetwork(chainId);
  if (!network) {
    throw new AppError(
      400,
      "EVM_CHAIN_NOT_CONFIGURED",
      `EVM chain ${chainId} is not configured. Set EVM_CHAIN_IDS and EVM_RPC_URL_${chainId}.`,
    );
  }

  return network.chainId;
}

/** Test hook — reset cached EVM config between tests. */
export function resetEvmConfigCacheForTests(): void {
  cachedEvmEnv = undefined;
  cachedNetworks = undefined;
}
