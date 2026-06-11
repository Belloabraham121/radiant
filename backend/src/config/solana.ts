import { z } from "zod";

function optional(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value && value.length > 0 ? value : undefined;
}

/** CAIP-2 identifiers for Privy Solana RPC calls. */
export const SOLANA_CAIP2 = {
  mainnet: "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp",
  devnet: "solana:EtWTRABZaYq6iMfeYKouRu166VU2xqaew",
} as const;

const solanaEnvSchema = z.object({
  SOLANA_RPC_URL: z.string().url().optional(),
  SOLANA_CAIP2: z.string().min(1).optional(),
  SOLANA_COMMITMENT: z.enum(["processed", "confirmed", "finalized"]).optional(),
});

type SolanaEnv = z.infer<typeof solanaEnvSchema>;

let cachedSolanaEnv: SolanaEnv | undefined;

function getSolanaEnv(): SolanaEnv {
  if (!cachedSolanaEnv) {
    cachedSolanaEnv = solanaEnvSchema.parse({
      SOLANA_RPC_URL: optional("SOLANA_RPC_URL"),
      SOLANA_CAIP2: optional("SOLANA_CAIP2"),
      SOLANA_COMMITMENT: optional("SOLANA_COMMITMENT") as
        | "processed"
        | "confirmed"
        | "finalized"
        | undefined,
    });
  }
  return cachedSolanaEnv;
}

export function getSolanaRpcUrl(): string {
  return getSolanaEnv().SOLANA_RPC_URL ?? "https://api.mainnet-beta.solana.com";
}

/** CAIP-2 passed to Privy `signAndSendTransaction`. */
export function getSolanaCaip2(): string {
  return getSolanaEnv().SOLANA_CAIP2 ?? SOLANA_CAIP2.mainnet;
}

export function getSolanaCommitment(): "processed" | "confirmed" | "finalized" {
  return getSolanaEnv().SOLANA_COMMITMENT ?? "confirmed";
}

/** Test hook — reset cached Solana config between tests. */
export function resetSolanaConfigCacheForTests(): void {
  cachedSolanaEnv = undefined;
}
