/**
 * Export Radiant v1 swap + bridge routing schema as JSON.
 *
 * Usage (from backend/):
 *   npx tsx scripts/export-swap-bridge-schema.ts [--out ../docs/swap-bridge-routing-schema.json]
 *
 * Reads ENABLED_CHAINS / EVM_CHAIN_IDS from env when set; otherwise uses v1 defaults.
 */
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { isLifiCrossEcosystemPair } from "../src/config/lifi-chains.js";
import {
  getSupportedChains,
  resetSupportedTokensCacheForTests,
  type SupportedChainEntry,
} from "../src/config/supported-tokens.js";
import {
  getBridgeReceiveTokenOptions,
  queryBridgeCapabilities,
} from "../src/config/token-capabilities.js";
import { resetChainConfigCacheForTests } from "../src/config/chains.js";
import { resetEvmConfigCacheForTests } from "../src/config/evm.js";
import { isSquidCrossEcosystemPair, isSquidSdkExecuteSupported } from "../src/config/squid-chains.js";
import { STELLAR_ROUTING_FALLBACK_TTL_SECONDS } from "../src/services/defi/stellar-routing/stellar-routing-fallback-cache.js";
import type { ChainId } from "../src/services/chains/types.js";

type ChainKey = string;

function chainKey(entry: SupportedChainEntry): ChainKey {
  if (entry.chain_id === "ethereum" && entry.evm_chain_id !== undefined) {
    return `ethereum:${entry.evm_chain_id}`;
  }
  return entry.chain_id;
}

function applyExportEnv(useRuntimeEnv: boolean): void {
  if (!useRuntimeEnv) {
    process.env.ENABLED_CHAINS = "sui,ethereum,solana,stellar";
    process.env.EVM_CHAIN_IDS = "1,42161,8453";
  } else {
    if (!process.env.ENABLED_CHAINS) {
      process.env.ENABLED_CHAINS = "sui,ethereum,solana,stellar";
    }
    if (!process.env.EVM_CHAIN_IDS) {
      process.env.EVM_CHAIN_IDS = "1,42161,8453";
    }
  }
  resetChainConfigCacheForTests();
  resetEvmConfigCacheForTests();
  resetSupportedTokensCacheForTests();
}

function isSameChain(a: SupportedChainEntry, b: SupportedChainEntry): boolean {
  if (a.chain_id !== b.chain_id) {
    return false;
  }
  if (a.chain_id === "ethereum") {
    return a.evm_chain_id === b.evm_chain_id;
  }
  return true;
}

function canRouteCrossChain(from: SupportedChainEntry, to: SupportedChainEntry): boolean {
  if (isSameChain(from, to)) {
    return false;
  }
  if (!from.bridge_provider || !to.bridge_provider) {
    return false;
  }
  try {
    return isLifiCrossEcosystemPair(from.chain_id, to.chain_id);
  } catch {
    return false;
  }
}

function squidBridgeNote(from: SupportedChainEntry, to: SupportedChainEntry): string | null {
  if (!isSquidCrossEcosystemPair(from.chain_id, to.chain_id)) {
    return "squid_not_supported_for_pair";
  }
  const fromRef =
    from.chain_id === "ethereum"
      ? { chain_id: "ethereum" as const, evm_chain_id: from.evm_chain_id! }
      : { chain_id: from.chain_id as "sui" | "solana" | "stellar" };
  const toRef =
    to.chain_id === "ethereum"
      ? { chain_id: "ethereum" as const, evm_chain_id: to.evm_chain_id! }
      : { chain_id: to.chain_id as "sui" | "solana" | "stellar" };
  if (!isSquidSdkExecuteSupported(fromRef) || !isSquidSdkExecuteSupported(toRef)) {
    return "squid_quote_only_or_execute_blocked";
  }
  return null;
}

function buildSchema(useRuntimeEnv: boolean) {
  const chains = getSupportedChains();
  const generatedAt = new Date().toISOString();

  const chainRecords = chains.map((entry) => ({
    key: chainKey(entry),
    chain_id: entry.chain_id,
    ...(entry.evm_chain_id !== undefined ? { evm_chain_id: entry.evm_chain_id } : {}),
    name: entry.name,
    native_symbol: entry.native_symbol,
    allowed_symbols: [...entry.allowed_symbols],
    swap_provider: entry.swap_provider,
    bridge_provider: entry.bridge_provider,
    capabilities: {
      same_chain_swap: entry.swap_provider !== null,
      agent_bridge_source: entry.bridge_provider !== null,
      agent_bridge_destination: entry.bridge_provider !== null,
    },
  }));

  const swapRoutes = chains
    .filter((entry) => entry.swap_provider !== null)
    .map((entry) => ({
      chain: chainKey(entry),
      provider: entry.swap_provider,
      tokens: [...entry.allowed_symbols],
      description: "Any allowlisted token pair on this network (same-chain swap).",
    }));

  const bridgeRoutes: Array<Record<string, unknown>> = [];

  for (const from of chains) {
    for (const to of chains) {
      if (!canRouteCrossChain(from, to)) {
        continue;
      }

      const receiveOptions = getBridgeReceiveTokenOptions(
        from.chain_id,
        from.evm_chain_id,
        to.chain_id,
        to.evm_chain_id,
      ).map((option) => option.id);

      const sampleFromToken = from.allowed_symbols[0];
      const capabilities = queryBridgeCapabilities(
        {
          chain_id: from.chain_id,
          evm_chain_id: from.evm_chain_id,
        },
        {
          chain_id: to.chain_id,
          evm_chain_id: to.evm_chain_id,
        },
        sampleFromToken,
      );

      bridgeRoutes.push({
        from: chainKey(from),
        to: chainKey(to),
        primary_provider: from.bridge_provider,
        fallback_provider: "evm-squid",
        cross_ecosystem: capabilities.cross_ecosystem,
        receive_tokens: receiveOptions,
        auto_fill_same_symbol_examples: from.allowed_symbols.filter((symbol) =>
          receiveOptions.includes(symbol),
        ),
        requires_same_token_confirmation_for: ["SUI", "SOL"].filter((symbol) =>
          from.allowed_symbols.includes(symbol),
        ),
        squid_note: squidBridgeNote(from, to),
      });
    }
  }

  const stellarEntry = chains.find((entry) => entry.chain_id === "stellar");
  const stellarSetup = {
    status: "swap_only_v1",
    swap_provider: stellarEntry?.swap_provider ?? "stellar-soroswap",
    bridge_provider: stellarEntry?.bridge_provider ?? null,
    allowed_symbols: stellarEntry?.allowed_symbols ?? ["XLM", "USDC"],
    gaps_for_agent_bridge: [
      "Set bridge_provider on stellar in supported-tokens.ts (currently null) — no agent bridge source/destination in v1.",
      "Li-Fi cross-ecosystem pairs exclude Stellar (lifi-chains.ts); stellar ↔ EVM bridge routes are not exported.",
      "Squid includes stellar-mainnet for quotes but executeRoute blocks Stellar (squid-chains.ts isSquidSdkExecuteSupported).",
      "Wrong-chain swap intent (e.g. XLM/USDC on Base) uses stellar_routing_fallback — same-chain Soroswap swap after user consent, not a bridge.",
      "Destination account must exist on Stellar ledger (fund with XLM reserve) before receiving assets; USDC requires trustline.",
    ],
    planned_bridge_targets: bridgeRoutes
      .filter((route) => String(route.to).startsWith("stellar") || String(route.from).startsWith("stellar"))
      .map((route) => route),
  };

  const stellarRoutingFallback = {
    description:
      "When both tokens exist on Stellar but the user selected a non-Stellar chain, offer a same-chain Soroswap swap after explicit consent (mirrors Squid liquidity_fallback_offered).",
    approval_outcome: "stellar_routing_fallback_offered",
    provider_after_accept: "stellar-soroswap",
    ttl_seconds: STELLAR_ROUTING_FALLBACK_TTL_SECONDS,
    statuses: ["offered", "accepted", "rejected", "expired"],
    triggers: [
      "detectStellarRoutingFallback(partialSwapIntent) — both tokens on Stellar, selected chain is not stellar.",
      "isStellarRoutingFallbackEligible(AppError) — CROSS_ECOSYSTEM_NOT_SUPPORTED with Stellar-eligible tokens.",
    ],
    no_soroswap_http_until: "User accepts the fallback offer (POST accept API or approval Yes).",
    stream_step_id: "stellar_routing_fallback_offered",
    client_timeline_step: "stellar-routing-offer",
    client_dialog: "StellarRoutingFallbackDialog",
    eligible_primary_error_codes: ["CROSS_ECOSYSTEM_NOT_SUPPORTED"],
    ineligible_error_codes: [
      "SOROSWAP_RATE_LIMITED",
      "SOROSWAP_UNAUTHORIZED",
      "SOROSWAP_VALIDATION_ERROR",
      "INSUFFICIENT_BALANCE",
      "SLIPPAGE_EXCEEDED",
      "WALLET_NOT_FOUND",
      "CHAIN_DISABLED",
    ],
    example: {
      user_intent: "swap 10 XLM to USDC on Base",
      selected_chain_id: "ethereum" as ChainId,
      selected_evm_chain_id: 8453,
      fallback_chain_id: "stellar" as ChainId,
      token_in: "XLM",
      token_out: "USDC",
    },
  };

  return {
    schema_version: "1.0.0",
    generated_at: generatedAt,
    description:
      "Radiant v1 swap and bridge routing matrix derived from supported-tokens, token-capabilities, lifi-chains, squid-chains, and stellar-routing fallback.",
    export_mode: useRuntimeEnv ? "runtime_env" : "full_v1_defaults",
    env_assumptions: {
      ENABLED_CHAINS: process.env.ENABLED_CHAINS ?? "sui,ethereum,solana,stellar",
      EVM_CHAIN_IDS: process.env.EVM_CHAIN_IDS ?? "1,42161,8453",
      note: useRuntimeEnv
        ? "Reflects current process env. Pass --full for the complete v1 planning matrix."
        : "Full v1 defaults (all ecosystems). Pass --use-env to reflect runtime ENABLED_CHAINS.",
    },
    providers: {
      swap: {
        "sui-deepbook": "Sui same-chain swaps (DeepBook)",
        "evm-lifi": "EVM same-chain swaps and cross-chain routes (primary)",
        "evm-squid": "Cross-chain fallback when Li-Fi has no route (dev/test: squid prefix)",
        "evm-sushiswap": "EVM same-chain fallback when configured",
        "stellar-soroswap": "Stellar same-chain swaps (Soroswap)",
      },
      bridge: {
        "evm-lifi": "Primary bridge for all chains with bridge_provider set",
        "evm-squid": "Alternate route after Li-Fi failure or squid test intent",
      },
    },
    chains: chainRecords,
    same_chain_swaps: swapRoutes,
    cross_chain_bridges: bridgeRoutes,
    stellar_setup: stellarSetup,
    stellar_routing_fallback: stellarRoutingFallback,
    rules: {
      bridge_receive_tokens: "Intersection of allowlisted symbols on source and destination.",
      evm_native_eth: "ETH/WETH/USDC auto-fill same-symbol receive on EVM L2↔L2 bridges.",
      cross_ecosystem_confirmation: "SUI and SOL same-symbol bridges require explicit user confirmation.",
      stellar_cross_ecosystem: "Not supported via Li-Fi in v1; Squid Stellar execute not wired.",
      stellar_routing_fallback:
        "Wrong-chain Stellar token pairs offer same-chain Soroswap swap after consent; no bridge or cross-ecosystem route.",
    },
  };
}

const outArg = process.argv.find((arg) => arg.startsWith("--out="))?.slice("--out=".length);
const useRuntimeEnv = process.argv.includes("--use-env");
const outPath = resolve(
  outArg ?? resolve(import.meta.dirname, "../../docs/swap-bridge-routing-schema.json"),
);

applyExportEnv(useRuntimeEnv);
const schema = buildSchema(useRuntimeEnv);
writeFileSync(outPath, `${JSON.stringify(schema, null, 2)}\n`, "utf8");
console.log(`Wrote ${outPath}`);
console.log(`Chains: ${schema.chains.length}, bridge routes: ${schema.cross_chain_bridges.length}`);
