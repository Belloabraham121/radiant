import { createHash } from "node:crypto";
import { getDeepBookEnv } from "./deepbook.js";
import { getEnabledChainConfigs } from "./chains.js";
import { getEnabledEvmChainIds, getEvmNetwork } from "./evm.js";
import { isLifiCrossEcosystemPair } from "./lifi-chains.js";
import { optional } from "./optional-env.js";
import { AppError } from "../errors/app-error.js";
import type { ChainId } from "../services/chains/types.js";
import type { DeFiProviderId } from "../services/defi/types.js";

export type TokenKind = "native" | "erc20" | "sui_coin" | "stellar_classic" | "soroban" | "spl";

export type SupportedToken = {
  symbol: string;
  kind: TokenKind;
  decimals: number;
  /** EVM contract address, Sui coin type, or Soroban contract id. */
  address?: string;
  /** Stellar classic asset code (e.g. USDC). */
  stellar_asset_code?: string;
  /** Stellar classic issuer account id. */
  stellar_issuer?: string;
};

export type SupportedChainEntry = {
  chain_id: ChainId;
  evm_chain_id?: number;
  name: string;
  native_symbol: string;
  swap_provider: DeFiProviderId | null;
  bridge_provider: DeFiProviderId | null;
  allowed_symbols: string[];
};

export type TokenResolveExact = {
  match: "exact";
  symbol: string;
  chain_id: ChainId;
  evm_chain_id?: number;
  token: SupportedToken;
};

export type TokenResolveFuzzy = {
  match: "fuzzy";
  input: string;
  chain_id: ChainId;
  evm_chain_id?: number;
  suggestions: Array<{ symbol: string; distance: number }>;
  /** Always false — fuzzy matches must not execute without user confirmation. */
  executable: false;
};

export type TokenResolveResult = TokenResolveExact | TokenResolveFuzzy;

/** Well-known mainnet ERC-20 addresses — override via `EVM_TOKEN_{SYMBOL}_{CHAIN_ID}`. */
const EVM_TOKEN_DEFAULTS: Record<number, Record<string, { address: string; decimals: number }>> = {
  1: {
    ETH: { address: "native", decimals: 18 },
    WETH: { address: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2", decimals: 18 },
    USDC: { address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", decimals: 6 },
  },
  42161: {
    ETH: { address: "native", decimals: 18 },
    WETH: { address: "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1", decimals: 18 },
    USDC: { address: "0xaf88d065e77c8cC2239337C08DAC3cc2995d3A9f", decimals: 6 },
    ARB: { address: "0x912CE59144191C1204E64559FE8253a113e52Cbf", decimals: 18 },
  },
  8453: {
    ETH: { address: "native", decimals: 18 },
    WETH: { address: "0x4200000000000000000000000000000000000006", decimals: 18 },
    USDC: { address: "0x833589fCD6eDb6E08f4c7C32D4f597b90BeA844E", decimals: 6 },
  },
};

/** Stellar mainnet — override classic issuer via `STELLAR_USDC_ISSUER`, Soroban via `STELLAR_USDC_SOROBAN_CONTRACT`. */
const STELLAR_USDC_ISSUER_DEFAULT = "GA5ZSEJY2YZN5OMRE3KK6QANRT6WK463FHAI3BYT5PBSHH5BYKHARY";
const STELLAR_USDC_SOROBAN_DEFAULT = "CBBMHZEZ65PQJIHKUQITQYFVOH7PIK6MLG2WBWRD2DWZXJKFSV7TFK";

/** Solana mainnet SPL mints — override via `SOLANA_TOKEN_{SYMBOL}`. */
const SOLANA_TOKEN_DEFAULTS: Record<string, { address: string; decimals: number }> = {
  SOL: { address: "11111111111111111111111111111111", decimals: 9 },
  USDC: { address: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", decimals: 6 },
};

const V1_ALLOWED_SYMBOLS: Record<ChainId, readonly string[]> = {
  sui: ["SUI", "USDC", "DEEP", "WAL"],
  ethereum: ["ETH", "WETH", "USDC", "ARB"],
  solana: ["SOL", "USDC"],
  stellar: ["XLM", "USDC"],
};

/** Symbols known on some chain but not necessarily on the requested chain. */
const GLOBAL_KNOWN_SYMBOLS = new Set([
  "SUI",
  "USDC",
  "DEEP",
  "WAL",
  "ETH",
  "WETH",
  "ARB",
  "XLM",
  "USDT",
  "DAI",
  "WBTC",
  "SOL",
]);

const FUZZY_MAX_SUGGESTIONS = 5;

function fuzzyDistanceThreshold(input: string, candidate: string): number {
  const maxLen = Math.max(input.length, candidate.length);
  if (maxLen <= 5) {
    return maxLen;
  }
  return Math.max(2, Math.floor(maxLen / 3));
}

let cachedSupportedChains: SupportedChainEntry[] | undefined;

function normalizeSymbol(input: string): string {
  return input.trim().toUpperCase();
}

function evmTokenAddress(symbol: string, chainId: number, defaultAddress: string): string {
  const override = optional(`EVM_TOKEN_${symbol}_${chainId}`, "").trim();
  return override.length > 0 ? override : defaultAddress;
}

function buildSuiToken(symbol: string): SupportedToken | null {
  const coins = getDeepBookEnv().coins;
  const coinMeta = coins[symbol as keyof typeof coins];
  if (!coinMeta) {
    return null;
  }

  if (symbol === "SUI") {
    return {
      symbol: "SUI",
      kind: "native",
      decimals: 9,
      address: coinMeta.type,
    };
  }

  return {
    symbol,
    kind: "sui_coin",
    decimals: Math.round(Math.log10(coinMeta.scalar)),
    address: coinMeta.type,
  };
}

function buildEvmToken(symbol: string, evmChainId: number): SupportedToken | null {
  const chainTokens = EVM_TOKEN_DEFAULTS[evmChainId];
  if (!chainTokens) {
    return null;
  }

  const meta = chainTokens[symbol];
  if (!meta) {
    return null;
  }

  if (symbol === "ETH" || meta.address === "native") {
    return {
      symbol: "ETH",
      kind: "native",
      decimals: 18,
    };
  }

  return {
    symbol,
    kind: "erc20",
    decimals: meta.decimals,
    address: evmTokenAddress(symbol, evmChainId, meta.address),
  };
}

function buildSolanaToken(symbol: string): SupportedToken | null {
  const meta = SOLANA_TOKEN_DEFAULTS[symbol];
  if (!meta) {
    return null;
  }

  const address =
    optional(`SOLANA_TOKEN_${symbol}`, "").trim() || meta.address;

  if (symbol === "SOL") {
    return {
      symbol: "SOL",
      kind: "native",
      decimals: meta.decimals,
      address,
    };
  }

  return {
    symbol,
    kind: "spl",
    decimals: meta.decimals,
    address,
  };
}

function buildStellarToken(symbol: string): SupportedToken | null {
  if (symbol === "XLM") {
    return {
      symbol: "XLM",
      kind: "native",
      decimals: 7,
    };
  }

  if (symbol === "USDC") {
    const issuer = optional("STELLAR_USDC_ISSUER", STELLAR_USDC_ISSUER_DEFAULT).trim();
    const sorobanContract = optional("STELLAR_USDC_SOROBAN_CONTRACT", STELLAR_USDC_SOROBAN_DEFAULT).trim();
    return {
      symbol: "USDC",
      kind: "stellar_classic",
      decimals: 7,
      stellar_asset_code: "USDC",
      stellar_issuer: issuer,
      address: sorobanContract,
    };
  }

  return null;
}

function allowedSymbolsForChain(chainId: ChainId, evmChainId?: number): string[] {
  if (chainId === "ethereum" && evmChainId !== undefined) {
    const chainTokens = EVM_TOKEN_DEFAULTS[evmChainId];
    if (!chainTokens) {
      return [];
    }
    return Object.keys(chainTokens).filter((symbol) => {
      if (symbol === "ARB" && evmChainId !== 42161) {
        return false;
      }
      return true;
    });
  }

  if (chainId === "ethereum") {
    const symbols = new Set<string>();
    for (const id of getEnabledEvmChainIds()) {
      for (const symbol of allowedSymbolsForChain("ethereum", id)) {
        symbols.add(symbol);
      }
    }
    return [...symbols];
  }

  return [...(V1_ALLOWED_SYMBOLS[chainId] ?? [])];
}

function resolveTokenOnChain(
  chainId: ChainId,
  symbol: string,
  evmChainId?: number,
): SupportedToken | null {
  if (chainId === "sui") {
    return buildSuiToken(symbol);
  }
  if (chainId === "ethereum") {
    if (evmChainId === undefined) {
      return null;
    }
    return buildEvmToken(symbol, evmChainId);
  }
  if (chainId === "stellar") {
    return buildStellarToken(symbol);
  }
  if (chainId === "solana") {
    return buildSolanaToken(symbol);
  }
  return null;
}

function levenshteinDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  const prev = new Array<number>(b.length + 1);
  const curr = new Array<number>(b.length + 1);

  for (let j = 0; j <= b.length; j++) {
    prev[j] = j;
  }

  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    for (let j = 0; j <= b.length; j++) {
      prev[j] = curr[j];
    }
  }

  return prev[b.length];
}

function findFuzzySuggestions(
  input: string,
  candidates: string[],
): Array<{ symbol: string; distance: number }> {
  const suggestions: Array<{ symbol: string; distance: number }> = [];

  for (const symbol of candidates) {
    const distance = levenshteinDistance(input, symbol);
    const threshold = fuzzyDistanceThreshold(input, symbol);
    if (distance > 0 && distance <= threshold) {
      suggestions.push({ symbol, distance });
    }
  }

  return suggestions
    .sort((a, b) => a.distance - b.distance || a.symbol.localeCompare(b.symbol))
    .slice(0, FUZZY_MAX_SUGGESTIONS);
}

function assertChainEnabled(chainId: ChainId): void {
  const enabled = getEnabledChainConfigs().some((config) => config.id === chainId);
  if (!enabled) {
    throw new AppError(400, "CHAIN_NOT_ENABLED", `Chain "${chainId}" is not enabled.`);
  }
}

function assertEvmChainEnabled(evmChainId: number): void {
  if (!getEnabledEvmChainIds().includes(evmChainId)) {
    throw new AppError(
      400,
      "CHAIN_NOT_ENABLED",
      `EVM chain ${evmChainId} is not enabled.`,
      { evm_chain_id: evmChainId },
    );
  }
}

function chainEcosystem(chainId: ChainId): "sui" | "evm" | "stellar" | "solana" {
  if (chainId === "ethereum") return "evm";
  return chainId;
}

/** Reject cross-ecosystem routing (e.g. stellar → base). */
export function assertCrossEcosystemSupported(
  fromChainId: ChainId,
  toChainId: ChainId,
): void {
  if (fromChainId === toChainId) {
    return;
  }

  if (chainEcosystem(fromChainId) !== chainEcosystem(toChainId)) {
    if (isLifiCrossEcosystemPair(fromChainId, toChainId)) {
      return;
    }
    throw new AppError(
      400,
      "CROSS_ECOSYSTEM_NOT_SUPPORTED",
      `Cross-ecosystem routing from ${fromChainId} to ${toChainId} is not supported in v1. ` +
        "Use same-ecosystem swaps or EVM-only bridges between enabled networks.",
      { from_chain_id: fromChainId, to_chain_id: toChainId },
    );
  }
}

/** Filter provider chain lists to Radiant v1 `ENABLED_EVM_CHAIN_IDS`. */
export function filterEnabledEvmChainIds(chainIds: number[]): number[] {
  const enabled = new Set(getEnabledEvmChainIds());
  return chainIds.filter((id) => enabled.has(id));
}

function buildSupportedChains(): SupportedChainEntry[] {
  const entries: SupportedChainEntry[] = [];
  const enabled = getEnabledChainConfigs();

  for (const config of enabled) {
    if (config.id === "ethereum") {
      for (const evmChainId of getEnabledEvmChainIds()) {
        const network = getEvmNetwork(evmChainId);
        entries.push({
          chain_id: "ethereum",
          evm_chain_id: evmChainId,
          name: network?.name ?? `EVM ${evmChainId}`,
          native_symbol: "ETH",
          swap_provider: "evm-sushiswap",
          bridge_provider: "evm-lifi",
          allowed_symbols: allowedSymbolsForChain("ethereum", evmChainId),
        });
      }
      continue;
    }

    if (config.id === "sui") {
      entries.push({
        chain_id: "sui",
        name: "Sui",
        native_symbol: "SUI",
        swap_provider: "sui-deepbook",
        bridge_provider: "evm-lifi",
        allowed_symbols: allowedSymbolsForChain("sui"),
      });
      continue;
    }

    if (config.id === "solana") {
      entries.push({
        chain_id: "solana",
        name: "Solana",
        native_symbol: "SOL",
        swap_provider: null,
        bridge_provider: "evm-lifi",
        allowed_symbols: allowedSymbolsForChain("solana"),
      });
      continue;
    }

    if (config.id === "stellar") {
      entries.push({
        chain_id: "stellar",
        name: "Stellar",
        native_symbol: "XLM",
        swap_provider: "stellar-soroswap",
        bridge_provider: null,
        allowed_symbols: allowedSymbolsForChain("stellar"),
      });
    }
  }

  return entries;
}

/** Radiant v1 chain list for agent / REST — cached for process lifetime. */
export function getSupportedChains(): SupportedChainEntry[] {
  if (!cachedSupportedChains) {
    cachedSupportedChains = buildSupportedChains();
  }
  return cachedSupportedChains;
}

/** True when symbol is on the v1 allowlist for the chain (throws on disabled chain). */
export function validateTokenAllowed(
  chainId: ChainId,
  symbol: string,
  evmChainId?: number,
): boolean {
  assertChainEnabled(chainId);

  if (chainId === "ethereum") {
    if (evmChainId === undefined) {
      const matchingChains = getEnabledEvmChainIds().filter((id) =>
        Boolean(resolveTokenOnChain("ethereum", normalizeSymbol(symbol), id)),
      );
      if (matchingChains.length > 1) {
        throw new AppError(
          400,
          "TOKEN_AMBIGUOUS",
          `Symbol "${symbol}" is valid on multiple EVM networks. Specify params.evm_chain_id.`,
          { symbol, evm_chain_ids: matchingChains },
        );
      }
      if (matchingChains.length === 0) {
        throw tokenNotAllowedError(chainId, symbol, evmChainId);
      }
      return true;
    }

    assertEvmChainEnabled(evmChainId);
  }

  const normalized = normalizeSymbol(symbol);
  const token = resolveTokenOnChain(chainId, normalized, evmChainId);
  if (!token) {
    throw tokenNotAllowedError(chainId, normalized, evmChainId);
  }

  return true;
}

function tokenNotAllowedError(
  chainId: ChainId,
  symbol: string,
  evmChainId?: number,
): AppError {
  if (GLOBAL_KNOWN_SYMBOLS.has(symbol)) {
    return new AppError(
      400,
      "TOKEN_NOT_SUPPORTED",
      `Token "${symbol}" is not supported on this chain in Radiant v1.`,
      { chain_id: chainId, evm_chain_id: evmChainId, symbol },
    );
  }

  return new AppError(
    400,
    "TOKEN_NOT_RECOGNIZED",
    `Token "${symbol}" is not recognized. Check spelling or pick from the allowlist.`,
    { chain_id: chainId, evm_chain_id: evmChainId, symbol },
  );
}

/**
 * Resolve a user token string to an allowlisted symbol.
 * Exact matches are executable; fuzzy matches return suggestions only (never silent execute).
 */
export function resolveTokenSymbol(
  chainId: ChainId,
  userInput: string,
  evmChainId?: number,
): TokenResolveResult {
  assertChainEnabled(chainId);

  const input = normalizeSymbol(userInput);
  if (input.length === 0) {
    throw new AppError(400, "VALIDATION_ERROR", "Token input must not be empty.");
  }

  if (chainId === "ethereum" && evmChainId === undefined) {
    const matchingChains = getEnabledEvmChainIds().filter((id) =>
      Boolean(resolveTokenOnChain("ethereum", input, id)),
    );

    if (matchingChains.length > 1) {
      throw new AppError(
        400,
        "TOKEN_AMBIGUOUS",
        `Symbol "${input}" is valid on multiple EVM networks. Specify params.evm_chain_id.`,
        { symbol: input, evm_chain_ids: matchingChains },
      );
    }

    if (matchingChains.length === 1) {
      return {
        match: "exact",
        symbol: input,
        chain_id: chainId,
        evm_chain_id: matchingChains[0],
        token: resolveTokenOnChain("ethereum", input, matchingChains[0])!,
      };
    }
  }

  if (chainId === "ethereum" && evmChainId !== undefined) {
    assertEvmChainEnabled(evmChainId);
  }

  const exactToken = resolveTokenOnChain(chainId, input, evmChainId);
  if (exactToken) {
    return {
      match: "exact",
      symbol: input,
      chain_id: chainId,
      evm_chain_id: evmChainId,
      token: exactToken,
    };
  }

  const candidates = allowedSymbolsForChain(chainId, evmChainId);
  if (GLOBAL_KNOWN_SYMBOLS.has(input) && !candidates.includes(input)) {
    throw tokenNotAllowedError(chainId, input, evmChainId);
  }

  const suggestions = findFuzzySuggestions(input, candidates);
  if (suggestions.length > 0) {
    return {
      match: "fuzzy",
      input,
      chain_id: chainId,
      evm_chain_id: evmChainId,
      suggestions,
      executable: false,
    };
  }

  throw tokenNotAllowedError(chainId, input, evmChainId);
}

/** Stable cache key component for token_resolve exact-match dedupe. */
export function hashTokenResolveInput(
  chainId: ChainId,
  userInput: string,
  evmChainId?: number,
): string {
  const payload = JSON.stringify({
    chain_id: chainId,
    input: normalizeSymbol(userInput),
    evm_chain_id: evmChainId ?? null,
  });
  return createHash("sha256").update(payload).digest("hex").slice(0, 16);
}

/** Test hook — reset process-lifetime supported chains cache. */
export function resetSupportedTokensCacheForTests(): void {
  cachedSupportedChains = undefined;
}
