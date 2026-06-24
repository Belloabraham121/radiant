import { z } from "zod";
import { AppError } from "../errors/app-error.js";

function optional(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value && value.length > 0 ? value : undefined;
}

const STELLAR_NETWORK_DEFAULTS = {
  mainnet: {
    horizonUrl: "https://horizon.stellar.org",
    sorobanRpcUrl: "https://soroban-rpc.mainnet.stellar.org:443",
    passphrase: "Public Global Stellar Network ; September 2015",
  },
  testnet: {
    horizonUrl: "https://horizon-testnet.stellar.org",
    sorobanRpcUrl: "https://soroban-rpc-testnet.stellar.org:443",
    passphrase: "Test SDF Network ; September 2015",
  },
} as const;

export type StellarNetwork = keyof typeof STELLAR_NETWORK_DEFAULTS;

const stellarEnvSchema = z.object({
  STELLAR_NETWORK: z.enum(["mainnet", "testnet"]).default("mainnet"),
  HORIZON_URL: z.string().url().optional(),
  SOROBAN_RPC_URL: z.string().url().optional(),
  STELLAR_PASSPHRASE: z.string().min(1).optional(),
});

type StellarEnv = z.infer<typeof stellarEnvSchema>;

let cachedStellarEnv: StellarEnv | undefined;

function getStellarEnv(): StellarEnv {
  if (!cachedStellarEnv) {
    const networkRaw = optional("STELLAR_NETWORK")?.toLowerCase();
    cachedStellarEnv = stellarEnvSchema.parse({
      STELLAR_NETWORK: networkRaw === "testnet" ? "testnet" : "mainnet",
      HORIZON_URL: optional("HORIZON_URL"),
      SOROBAN_RPC_URL: optional("SOROBAN_RPC_URL"),
      STELLAR_PASSPHRASE: optional("STELLAR_PASSPHRASE"),
    });
  }
  return cachedStellarEnv;
}

function networkDefaults(): (typeof STELLAR_NETWORK_DEFAULTS)[StellarNetwork] {
  return STELLAR_NETWORK_DEFAULTS[getStellarEnv().STELLAR_NETWORK];
}

/** Active Stellar network (`mainnet` or `testnet`). */
export function getStellarNetwork(): StellarNetwork {
  return getStellarEnv().STELLAR_NETWORK;
}

/** Horizon REST base URL for account/balance reads. */
export function getHorizonUrl(): string {
  return getStellarEnv().HORIZON_URL ?? networkDefaults().horizonUrl;
}

/** Soroban RPC URL for contract simulation and submission. */
export function getSorobanRpcUrl(): string {
  return getStellarEnv().SOROBAN_RPC_URL ?? networkDefaults().sorobanRpcUrl;
}

/** Network passphrase for transaction hashing and signing. */
export function getStellarPassphrase(): string {
  return getStellarEnv().STELLAR_PASSPHRASE ?? networkDefaults().passphrase;
}

export type StellarRpcConfig = {
  network: StellarNetwork;
  horizonUrl: string;
  sorobanRpcUrl: string;
  passphrase: string;
};

/** Resolved Stellar RPC endpoints — throws when env overrides are invalid. */
export function requireStellarRpcConfig(): StellarRpcConfig {
  try {
    const env = getStellarEnv();
    const defaults = networkDefaults();
    const horizonUrl = env.HORIZON_URL ?? defaults.horizonUrl;
    const sorobanRpcUrl = env.SOROBAN_RPC_URL ?? defaults.sorobanRpcUrl;
    const passphrase = env.STELLAR_PASSPHRASE ?? defaults.passphrase;

    if (!horizonUrl || !sorobanRpcUrl || !passphrase) {
      throw new AppError(
        503,
        "STELLAR_CHAIN_NOT_CONFIGURED",
        "Stellar RPC is not configured. Set HORIZON_URL, SOROBAN_RPC_URL, and STELLAR_NETWORK.",
      );
    }

    return {
      network: env.STELLAR_NETWORK,
      horizonUrl,
      sorobanRpcUrl,
      passphrase,
    };
  } catch (err) {
    if (err instanceof AppError) {
      throw err;
    }
    throw new AppError(
      503,
      "STELLAR_CHAIN_NOT_CONFIGURED",
      "Stellar RPC configuration is invalid. Check HORIZON_URL, SOROBAN_RPC_URL, and STELLAR_NETWORK.",
      { cause: err instanceof Error ? err.message : String(err) },
    );
  }
}

const STELLAR_UNAVAILABLE_PATTERN =
  /fetch failed|ECONNRESET|ETIMEDOUT|network request failed|horizon.*timeout|soroban.*timeout/i;

export function isStellarRpcUnavailableError(err: unknown): boolean {
  if (err instanceof AppError && err.code === "STELLAR_RPC_UNAVAILABLE") {
    return true;
  }
  const message = err instanceof Error ? err.message : String(err);
  return STELLAR_UNAVAILABLE_PATTERN.test(message);
}

export function stellarRpcUnavailableAppError(cause: unknown): AppError {
  const message = cause instanceof Error ? cause.message : String(cause);
  return new AppError(
    503,
    "STELLAR_RPC_UNAVAILABLE",
    "Could not reach Stellar RPC (Horizon or Soroban). Try again in a moment.",
    { cause: message },
  );
}

/** Test hook — reset cached Stellar config between tests. */
export function resetStellarConfigCacheForTests(): void {
  cachedStellarEnv = undefined;
}
