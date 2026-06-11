import { z } from "zod";
import type { ChainId } from "../services/chains/types.js";
import { CHAIN_IDS } from "../services/chains/types.js";

function optional(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value && value.length > 0 ? value : undefined;
}

const chainIdSchema = z.enum(CHAIN_IDS);

export type ChainConfig = {
  id: ChainId;
  enabled: boolean;
  nativeSymbol: string;
  rpcUrl?: string;
  policyId?: string;
  /** Privy `chain_type` for embedded wallet creation. */
  privyChainType: string;
};

const chainsEnvSchema = z.object({
  DEFAULT_AGENT_CHAIN: chainIdSchema.default("sui"),
  ENABLED_CHAINS: z.string().optional(),
  SUI_RPC_URL: z.string().url().optional(),
  PRIVY_SUI_POLICY_ID: z.string().min(1).optional(),
  PRIVY_EVM_POLICY_ID: z.string().min(1).optional(),
  PRIVY_SOLANA_POLICY_ID: z.string().min(1).optional(),
  EVM_RPC_URL: z.string().url().optional(),
  SOLANA_RPC_URL: z.string().url().optional(),
});

type ChainsEnv = z.infer<typeof chainsEnvSchema>;

let cachedChainsEnv: ChainsEnv | undefined;

function getChainsEnv(): ChainsEnv {
  if (!cachedChainsEnv) {
    cachedChainsEnv = chainsEnvSchema.parse({
      DEFAULT_AGENT_CHAIN: optional("DEFAULT_AGENT_CHAIN") ?? "sui",
      ENABLED_CHAINS: optional("ENABLED_CHAINS"),
      SUI_RPC_URL: optional("SUI_RPC_URL"),
      PRIVY_SUI_POLICY_ID: optional("PRIVY_SUI_POLICY_ID"),
      PRIVY_EVM_POLICY_ID: optional("PRIVY_EVM_POLICY_ID"),
      PRIVY_SOLANA_POLICY_ID: optional("PRIVY_SOLANA_POLICY_ID"),
      EVM_RPC_URL: optional("EVM_RPC_URL"),
      SOLANA_RPC_URL: optional("SOLANA_RPC_URL"),
    });
  }
  return cachedChainsEnv;
}

function parseEnabledChainIds(): ChainId[] {
  const raw = getChainsEnv().ENABLED_CHAINS;
  if (!raw) {
    return ["sui"];
  }

  const ids = raw
    .split(",")
    .map((part) => part.trim().toLowerCase())
    .filter((part) => part.length > 0);

  const parsed: ChainId[] = [];
  for (const id of ids) {
    const result = chainIdSchema.safeParse(id);
    if (result.success) {
      parsed.push(result.data);
    }
  }

  return parsed.length > 0 ? parsed : ["sui"];
}

function buildChainCatalog(): Record<ChainId, ChainConfig> {
  const env = getChainsEnv();

  return {
    sui: {
      id: "sui",
      enabled: false,
      nativeSymbol: "SUI",
      rpcUrl: env.SUI_RPC_URL ?? "https://fullnode.mainnet.sui.io",
      policyId: env.PRIVY_SUI_POLICY_ID,
      privyChainType: "sui",
    },
    ethereum: {
      id: "ethereum",
      enabled: false,
      nativeSymbol: "ETH",
      rpcUrl: env.EVM_RPC_URL,
      policyId: env.PRIVY_EVM_POLICY_ID,
      privyChainType: "ethereum",
    },
    solana: {
      id: "solana",
      enabled: false,
      nativeSymbol: "SOL",
      rpcUrl: env.SOLANA_RPC_URL,
      policyId: env.PRIVY_SOLANA_POLICY_ID,
      privyChainType: "solana",
    },
  };
}

let cachedConfigs: ChainConfig[] | undefined;

/** Enabled chain configs (adapter + env). MVP: Sui only unless ENABLED_CHAINS expands. */
export function getEnabledChainConfigs(): ChainConfig[] {
  if (!cachedConfigs) {
    const catalog = buildChainCatalog();
    const enabledIds = new Set(parseEnabledChainIds());
    cachedConfigs = CHAIN_IDS.filter((id) => enabledIds.has(id)).map((id) => ({
      ...catalog[id],
      enabled: true,
    }));
  }
  return cachedConfigs;
}

export function getChainConfig(chainId: ChainId): ChainConfig | null {
  return getEnabledChainConfigs().find((config) => config.id === chainId) ?? null;
}

export function getDefaultAgentChainId(): ChainId {
  const preferred = getChainsEnv().DEFAULT_AGENT_CHAIN;
  const enabled = getEnabledChainConfigs();
  if (enabled.some((config) => config.id === preferred)) {
    return preferred;
  }
  return enabled[0]?.id ?? "sui";
}

/** Test hook — reset cached config between tests. */
export function resetChainConfigCacheForTests(): void {
  cachedChainsEnv = undefined;
  cachedConfigs = undefined;
}
