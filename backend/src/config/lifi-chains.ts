import { getEnabledChainConfigs } from "./chains.js";
import { getEnabledEvmChainIds } from "./evm.js";
import { optional } from "./optional-env.js";
import { AppError } from "../errors/app-error.js";
import type { ChainId } from "../services/chains/types.js";

/** Li-Fi numeric chain id for Sui mainnet. */
export const LIFI_SUI_CHAIN_ID = 9270000000000000;

/** Li-Fi numeric chain id for Solana mainnet. */
export const LIFI_SOLANA_CHAIN_ID = 1151111081099710;

export type LifiRadiantChainId = Extract<ChainId, "sui" | "solana" | "ethereum">;

export type LifiChainRef =
  | { chain_id: "sui" }
  | { chain_id: "solana" }
  | { chain_id: "ethereum"; evm_chain_id: number };

const LIFI_RADIANT_CHAIN_IDS: readonly LifiRadiantChainId[] = ["sui", "solana", "ethereum"];

function parseOptionalLifiChainIdOverride(): number[] | null {
  const raw = optional("LIFI_ENABLED_CHAIN_IDS", "").trim();
  if (!raw) {
    return null;
  }

  const ids = raw
    .split(",")
    .map((part) => Number.parseInt(part.trim(), 10))
    .filter((id) => Number.isInteger(id) && id > 0);

  return ids.length > 0 ? ids : null;
}

/** Enabled Li-Fi chain ids — optional `LIFI_ENABLED_CHAIN_IDS` override, else derived from Radiant env. */
export function getEnabledLifiChainIds(): number[] {
  const override = parseOptionalLifiChainIdOverride();
  if (override) {
    return override;
  }

  const enabledRadiant = new Set(getEnabledChainConfigs().map((config) => config.id));
  const ids: number[] = [];

  if (enabledRadiant.has("sui")) {
    ids.push(LIFI_SUI_CHAIN_ID);
  }
  if (enabledRadiant.has("solana")) {
    ids.push(LIFI_SOLANA_CHAIN_ID);
  }
  if (enabledRadiant.has("ethereum")) {
    ids.push(...getEnabledEvmChainIds());
  }

  return ids;
}

export function isLifiRadiantChain(chainId: ChainId): chainId is LifiRadiantChainId {
  return (LIFI_RADIANT_CHAIN_IDS as readonly string[]).includes(chainId);
}

export function radiantChainRefToLifiChainId(ref: LifiChainRef): number {
  switch (ref.chain_id) {
    case "sui":
      return LIFI_SUI_CHAIN_ID;
    case "solana":
      return LIFI_SOLANA_CHAIN_ID;
    case "ethereum":
      return ref.evm_chain_id;
  }
}

export function lifiChainIdToRadiantChainRef(lifiChainId: number): LifiChainRef | null {
  if (lifiChainId === LIFI_SUI_CHAIN_ID) {
    return { chain_id: "sui" };
  }
  if (lifiChainId === LIFI_SOLANA_CHAIN_ID) {
    return { chain_id: "solana" };
  }
  if (getEnabledEvmChainIds().includes(lifiChainId)) {
    return { chain_id: "ethereum", evm_chain_id: lifiChainId };
  }
  return null;
}

export function assertEnabledLifiChainRef(ref: LifiChainRef): void {
  const lifiId = radiantChainRefToLifiChainId(ref);
  if (!getEnabledLifiChainIds().includes(lifiId)) {
    throw new AppError(400, "CHAIN_NOT_ENABLED", `Chain is not enabled for Li-Fi.`, {
      chain_id: ref.chain_id,
      ...(ref.chain_id === "ethereum" ? { evm_chain_id: ref.evm_chain_id } : {}),
      lifi_chain_id: lifiId,
    });
  }
}

export function resolveLifiChainRef(input: {
  chain_id?: ChainId;
  evm_chain_id?: number;
}): LifiChainRef {
  const chainId = input.chain_id ?? "ethereum";

  if (!isLifiRadiantChain(chainId)) {
    throw new AppError(400, "CHAIN_NOT_ENABLED", `Chain "${chainId}" is not supported by Li-Fi.`, {
      chain_id: chainId,
    });
  }

  if (chainId === "ethereum") {
    if (input.evm_chain_id === undefined) {
      throw new AppError(
        400,
        "VALIDATION_ERROR",
        "evm_chain_id is required when chain_id is ethereum.",
      );
    }
    return { chain_id: "ethereum", evm_chain_id: input.evm_chain_id };
  }

  return { chain_id: chainId };
}

function isRadiantChainEnabledForLifi(chainId: LifiRadiantChainId): boolean {
  const enabledLifi = new Set(getEnabledLifiChainIds());
  if (chainId === "ethereum") {
    return getEnabledEvmChainIds().some((evmChainId) => enabledLifi.has(evmChainId));
  }
  return enabledLifi.has(radiantChainRefToLifiChainId({ chain_id: chainId }));
}

/** Cross-ecosystem pair allowed when both chains are in the Li-Fi allowlist (excludes Stellar). */
export function isLifiCrossEcosystemPair(fromChainId: ChainId, toChainId: ChainId): boolean {
  if (fromChainId === toChainId) {
    return true;
  }
  if (!isLifiRadiantChain(fromChainId) || !isLifiRadiantChain(toChainId)) {
    return false;
  }

  return isRadiantChainEnabledForLifi(fromChainId) && isRadiantChainEnabledForLifi(toChainId);
}

export function filterEnabledLifiChainIds(chainIds: number[]): number[] {
  const enabled = new Set(getEnabledLifiChainIds());
  return chainIds.filter((id) => enabled.has(id));
}

export function lifiChainRefLabel(ref: LifiChainRef): string {
  if (ref.chain_id === "ethereum") {
    return `ethereum:${ref.evm_chain_id}`;
  }
  return ref.chain_id;
}
