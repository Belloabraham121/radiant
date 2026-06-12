import { z } from "zod";

function optional(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value && value.length > 0 ? value : undefined;
}

function parsePemFromEnv(value: string): string {
  if (value.startsWith('"') && value.endsWith('"')) {
    return value.slice(1, -1).replace(/\\n/g, "\n");
  }
  return value.replace(/\\n/g, "\n");
}

const privyWalletEnvSchema = z.object({
  PRIVY_SIGNER_QUORUM_ID: z.string().min(1).optional(),
  PRIVY_SUI_POLICY_ID: z.string().min(1).optional(),
  PRIVY_AUTHORIZATION_PRIVATE_KEY: z.string().min(1).optional(),
  SUI_RPC_URL: z.string().url(),
});

export type PrivyWalletEnv = z.infer<typeof privyWalletEnvSchema>;

let cachedPrivyWalletEnv: PrivyWalletEnv | undefined;

/** Tool 2 env — signer quorum, policy, authorization key, Sui RPC. */
export function getPrivyWalletEnv(): PrivyWalletEnv {
  if (!cachedPrivyWalletEnv) {
    cachedPrivyWalletEnv = privyWalletEnvSchema.parse({
      PRIVY_SIGNER_QUORUM_ID: optional("PRIVY_SIGNER_QUORUM_ID"),
      PRIVY_SUI_POLICY_ID: optional("PRIVY_SUI_POLICY_ID"),
      PRIVY_AUTHORIZATION_PRIVATE_KEY: optional("PRIVY_AUTHORIZATION_PRIVATE_KEY"),
      SUI_RPC_URL: process.env.SUI_RPC_URL ?? "https://fullnode.mainnet.sui.io",
    });
  }
  return cachedPrivyWalletEnv;
}

/** PEM authorization private key for server-side Privy signing. */
export function getAuthorizationPrivateKey(): string | null {
  const raw = getPrivyWalletEnv().PRIVY_AUTHORIZATION_PRIVATE_KEY;
  return raw ? parsePemFromEnv(raw) : null;
}

export function getSignerQuorumId(): string | null {
  return getPrivyWalletEnv().PRIVY_SIGNER_QUORUM_ID ?? null;
}

export function getSuiPolicyId(): string | null {
  return getPrivyWalletEnv().PRIVY_SUI_POLICY_ID ?? null;
}
