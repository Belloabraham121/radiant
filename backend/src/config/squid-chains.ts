import { getEnabledChainConfigs } from "./chains.js";
import { getEnabledEvmChainIds } from "./evm.js";
import { optional } from "./optional-env.js";
import { AppError } from "../errors/app-error.js";
import type { ChainId } from "../services/chains/types.js";

/** Squid string chain id for Sui mainnet. */
export const SQUID_SUI_CHAIN_ID = "sui-mainnet";

/** Squid string chain id for Solana mainnet. */
export const SQUID_SOLANA_CHAIN_ID = "solana-mainnet-beta";

/** Squid string chain id for Stellar mainnet (soft support when Radiant enables stellar). */
export const SQUID_STELLAR_CHAIN_ID = "stellar-mainnet";

export type SquidRadiantChainId = Extract<ChainId, "sui" | "solana" | "ethereum" | "stellar">;

export type SquidChainRef =
  | { chain_id: "sui" }
  | { chain_id: "solana" }
  | { chain_id: "stellar" }
  | { chain_id: "ethereum"; evm_chain_id: number };

const SQUID_RADIANT_CHAIN_IDS: readonly SquidRadiantChainId[] = [
  "sui",
  "solana",
  "ethereum",
  "stellar",
];

function parseOptionalSquidChainIdOverride(): string[] | null {
  const raw = optional("SQUID_ENABLED_CHAIN_IDS", "").trim();
  if (!raw) {
    return null;
  }

  const ids = raw
    .split(",")
    .map((part) => part.trim())
    .filter((id) => id.length > 0);

  return ids.length > 0 ? ids : null;
}

/** Enabled Squid chain ids — optional `SQUID_ENABLED_CHAIN_IDS` override, else derived from Radiant env. */
export function getEnabledSquidChainIds(): string[] {
  const override = parseOptionalSquidChainIdOverride();
  if (override) {
    return override;
  }

  const enabledRadiant = new Set(getEnabledChainConfigs().map((config) => config.id));
  const ids: string[] = [];

  if (enabledRadiant.has("sui")) {
    ids.push(SQUID_SUI_CHAIN_ID);
  }
  if (enabledRadiant.has("solana")) {
    ids.push(SQUID_SOLANA_CHAIN_ID);
  }
  if (enabledRadiant.has("stellar")) {
    ids.push(SQUID_STELLAR_CHAIN_ID);
  }
  if (enabledRadiant.has("ethereum")) {
    for (const evmChainId of getEnabledEvmChainIds()) {
      ids.push(String(evmChainId));
    }
  }

  return ids;
}

export function isSquidRadiantChain(chainId: ChainId): chainId is SquidRadiantChainId {
  return (SQUID_RADIANT_CHAIN_IDS as readonly string[]).includes(chainId);
}

export function radiantChainRefToSquidChainId(ref: SquidChainRef): string {
  switch (ref.chain_id) {
    case "sui":
      return SQUID_SUI_CHAIN_ID;
    case "solana":
      return SQUID_SOLANA_CHAIN_ID;
    case "stellar":
      return SQUID_STELLAR_CHAIN_ID;
    case "ethereum":
      return String(ref.evm_chain_id);
  }
}

export function squidChainIdToRadiantChainRef(squidChainId: string): SquidChainRef | null {
  if (squidChainId === SQUID_SUI_CHAIN_ID) {
    return { chain_id: "sui" };
  }
  if (squidChainId === SQUID_SOLANA_CHAIN_ID) {
    return { chain_id: "solana" };
  }
  if (squidChainId === SQUID_STELLAR_CHAIN_ID) {
    return { chain_id: "stellar" };
  }

  const evmChainId = Number.parseInt(squidChainId, 10);
  if (Number.isInteger(evmChainId) && evmChainId > 0 && getEnabledEvmChainIds().includes(evmChainId)) {
    return { chain_id: "ethereum", evm_chain_id: evmChainId };
  }

  return null;
}

export function assertEnabledSquidChainRef(ref: SquidChainRef): void {
  const squidId = radiantChainRefToSquidChainId(ref);
  if (!getEnabledSquidChainIds().includes(squidId)) {
    throw new AppError(400, "CHAIN_NOT_ENABLED", `Chain is not enabled for Squid.`, {
      chain_id: ref.chain_id,
      ...(ref.chain_id === "ethereum" ? { evm_chain_id: ref.evm_chain_id } : {}),
      squid_chain_id: squidId,
    });
  }
}

export function resolveSquidChainRef(input: {
  chain_id?: ChainId;
  evm_chain_id?: number;
}): SquidChainRef {
  const chainId = input.chain_id ?? "ethereum";

  if (!isSquidRadiantChain(chainId)) {
    throw new AppError(400, "CHAIN_NOT_ENABLED", `Chain "${chainId}" is not supported by Squid.`, {
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

function isRadiantChainEnabledForSquid(chainId: SquidRadiantChainId): boolean {
  const enabledSquid = new Set(getEnabledSquidChainIds());
  if (chainId === "ethereum") {
    return getEnabledEvmChainIds().some((evmChainId) => enabledSquid.has(String(evmChainId)));
  }
  if (chainId === "stellar") {
    return enabledSquid.has(SQUID_STELLAR_CHAIN_ID);
  }
  return enabledSquid.has(radiantChainRefToSquidChainId({ chain_id: chainId }));
}

/** Cross-ecosystem pair allowed when both chains are in the Squid allowlist (excludes Stellar). */
export function isSquidCrossEcosystemPair(fromChainId: ChainId, toChainId: ChainId): boolean {
  if (fromChainId === toChainId) {
    return true;
  }
  if (!isSquidRadiantChain(fromChainId) || !isSquidRadiantChain(toChainId)) {
    return false;
  }

  return isRadiantChainEnabledForSquid(fromChainId) && isRadiantChainEnabledForSquid(toChainId);
}

export function filterEnabledSquidChainIds(chainIds: string[]): string[] {
  const enabled = new Set(getEnabledSquidChainIds());
  return chainIds.filter((id) => enabled.has(id));
}

export function squidChainRefLabel(ref: SquidChainRef): string {
  if (ref.chain_id === "ethereum") {
    return `ethereum:${ref.evm_chain_id}`;
  }
  return ref.chain_id;
}

/** Squid SDK executeRoute does not implement Stellar handlers yet — reject before execute. */
export function isSquidSdkExecuteSupported(ref: SquidChainRef): boolean {
  return ref.chain_id !== "stellar";
}
