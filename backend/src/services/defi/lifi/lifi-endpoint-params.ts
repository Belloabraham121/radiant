import { getEnabledChainConfigs } from "../../../config/chains.js";
import { getEnabledEvmChainIds, getEvmNetwork } from "../../../config/evm.js";
import {
  isLifiRadiantChain,
  type LifiRadiantChainId,
} from "../../../config/lifi-chains.js";

/** Extra nicknames not derivable from network display names alone. */
const EVM_CHAIN_EXTRA_SLUGS: Record<number, readonly string[]> = {
  1: ["eth", "mainnet"],
  42161: ["arb"],
};

function firstWordLower(value: string): string {
  const trimmed = value.trim().toLowerCase();
  const space = trimmed.indexOf(" ");
  return space === -1 ? trimmed : trimmed.slice(0, space);
}

function collectEvmChainSlugs(chainId: number, networkName: string): string[] {
  const slugs = new Set<string>();
  slugs.add(String(chainId));
  const lower = networkName.trim().toLowerCase();
  if (lower) {
    slugs.add(lower);
    slugs.add(firstWordLower(lower));
  }
  for (const slug of EVM_CHAIN_EXTRA_SLUGS[chainId] ?? []) {
    slugs.add(slug);
  }
  return [...slugs];
}

function slugToChainIdMap(): Record<string, number> {
  const enabled = new Set(getEnabledEvmChainIds());
  const map: Record<string, number> = {};
  for (const chainId of enabled) {
    const network = getEvmNetwork(chainId);
    const name = network?.name ?? `EVM ${chainId}`;
    for (const slug of collectEvmChainSlugs(chainId, name)) {
      map[slug] = chainId;
    }
  }
  return map;
}

function enabledNonEvmLifiChainIds(): LifiRadiantChainId[] {
  return getEnabledChainConfigs()
    .map((config) => config.id)
    .filter((id): id is LifiRadiantChainId => isLifiRadiantChain(id) && id !== "ethereum");
}

function nonEvmChainSlugMap(): Record<string, LifiRadiantChainId> {
  const enabled = new Set(enabledNonEvmLifiChainIds());
  const map: Record<string, LifiRadiantChainId> = {};
  for (const chainId of enabled) {
    map[chainId] = chainId;
    if (chainId === "solana") {
      map.sol = "solana";
    }
  }
  return map;
}

export function resolveEvmChainIdFromLabel(label: unknown): number | undefined {
  if (typeof label !== "string") {
    return undefined;
  }
  const key = label.trim().toLowerCase();
  if (!key) {
    return undefined;
  }
  return slugToChainIdMap()[key];
}

export function resolveNonEvmChainIdFromLabel(label: unknown): LifiRadiantChainId | undefined {
  if (typeof label !== "string") {
    return undefined;
  }
  const key = label.trim().toLowerCase();
  if (!key) {
    return undefined;
  }
  return nonEvmChainSlugMap()[key];
}

export function formatEnabledEvmDestinationHint(): string {
  return getEnabledEvmChainIds()
    .map((id) => {
      const name = getEvmNetwork(id)?.name ?? `chain ${id}`;
      const slugs = collectEvmChainSlugs(id, name);
      const primarySlug = slugs.find((slug) => slug !== String(id)) ?? String(id);
      return `${name} → to_evm_chain_id ${id} (or destination_evm: ${primarySlug})`;
    })
    .join("; ");
}

/** All Li-Fi bridge endpoints enabled on this deployment (non-EVM + EVM networks). */
export function formatEnabledBridgeDestinationHint(): string {
  const parts: string[] = [];
  for (const chainId of enabledNonEvmLifiChainIds()) {
    const label = chainId === "solana" ? "Solana (solana|sol)" : "Sui (sui)";
    parts.push(`${label} → to_chain_id ${chainId}`);
  }
  const evmHint = formatEnabledEvmDestinationHint();
  if (evmHint) {
    parts.push(evmHint);
  }
  return parts.join("; ");
}

function firstDefined(...values: unknown[]): unknown {
  for (const value of values) {
    if (value !== undefined && value !== null && value !== "") {
      return value;
    }
  }
  return undefined;
}

function readDestinationLabel(record: Record<string, unknown>): unknown {
  return firstDefined(
    record.destination_evm,
    record.to_network,
    record.destination_network,
    record.dest_network,
    record.to_chain_name,
  );
}

function readSourceLabel(record: Record<string, unknown>): unknown {
  return firstDefined(
    record.source_evm,
    record.from_network,
    record.source_network,
    record.from_chain_name,
  );
}

/** Normalize agent params before Li-Fi Zod validation (network labels → chain ids). */
export function normalizeLifiCrossChainParams(input: unknown): unknown {
  if (typeof input !== "object" || input === null) {
    return input;
  }

  const record = { ...(input as Record<string, unknown>) };

  if (record.to_evm_chain_id === undefined && record.to_chain_id === undefined) {
    const destLabel = readDestinationLabel(record);
    const nonEvmDest = resolveNonEvmChainIdFromLabel(destLabel);
    if (nonEvmDest !== undefined) {
      record.to_chain_id = nonEvmDest;
    }
  }

  if (record.to_evm_chain_id === undefined) {
    const destLabel = readDestinationLabel(record);
    const resolved = resolveEvmChainIdFromLabel(destLabel);
    if (resolved !== undefined) {
      record.to_evm_chain_id = resolved;
    }
  }

  if (record.from_evm_chain_id === undefined && record.from_chain_id === undefined) {
    const sourceLabel = readSourceLabel(record);
    const nonEvmSource = resolveNonEvmChainIdFromLabel(sourceLabel);
    if (nonEvmSource !== undefined) {
      record.from_chain_id = nonEvmSource;
    }
  }

  if (record.from_evm_chain_id === undefined) {
    const sourceLabel = readSourceLabel(record);
    const resolved = resolveEvmChainIdFromLabel(sourceLabel);
    if (resolved !== undefined) {
      record.from_evm_chain_id = resolved;
    }
  }

  if (record.to_chain_id === undefined && record.to_evm_chain_id !== undefined) {
    record.to_chain_id = "ethereum";
  }
  if (record.from_chain_id === undefined && record.from_evm_chain_id !== undefined) {
    record.from_chain_id = "ethereum";
  }

  return record;
}

export function isUnrecognizedDestinationLabel(record: Record<string, unknown>): boolean {
  const destLabel = readDestinationLabel(record);
  if (typeof destLabel !== "string" || !destLabel.trim()) {
    return false;
  }
  if (record.to_evm_chain_id !== undefined || record.to_chain_id !== undefined) {
    return false;
  }
  return true;
}

export function isUnrecognizedSourceLabel(record: Record<string, unknown>): boolean {
  const sourceLabel = readSourceLabel(record);
  if (typeof sourceLabel !== "string" || !sourceLabel.trim()) {
    return false;
  }
  if (record.from_evm_chain_id !== undefined || record.from_chain_id !== undefined) {
    return false;
  }
  return true;
}
