import type { User } from "@privy-io/react-auth";
import type { AgentChainId } from "@/lib/agent-chains";
import { privyChainTypeFor } from "@/lib/agent-chains";

export type PrivyEmbeddedWalletRef = {
  privyWalletId: string;
  address: string;
};

/** @deprecated Use `PrivyEmbeddedWalletRef`. */
export type PrivySuiWalletRef = PrivyEmbeddedWalletRef;

function isPrivyEmbeddedWallet(account: {
  walletClientType?: string;
}): boolean {
  return (
    account.walletClientType === "privy" || account.walletClientType === "privy-v2"
  );
}

/** Privy embedded agent wallet for a chain family from linked accounts. */
export function findPrivyEmbeddedWallet(
  user: User | null,
  chainId: AgentChainId,
): PrivyEmbeddedWalletRef | null {
  if (!user) return null;

  const privyChainType = privyChainTypeFor(chainId);

  for (const account of user.linkedAccounts) {
    if (account.type !== "wallet") continue;
    if (account.chainType !== privyChainType) continue;
    if (!isPrivyEmbeddedWallet(account)) continue;
    if (!account.id) continue;

    return {
      privyWalletId: account.id,
      address: account.address,
    };
  }

  return null;
}

/** Privy embedded Sui agent wallet from the user's linked accounts. */
export function findPrivySuiWallet(user: User | null): PrivyEmbeddedWalletRef | null {
  return findPrivyEmbeddedWallet(user, "sui");
}

export function findPrivyEthereumWallet(
  user: User | null,
): PrivyEmbeddedWalletRef | null {
  return findPrivyEmbeddedWallet(user, "ethereum");
}

export function findPrivySolanaWallet(user: User | null): PrivyEmbeddedWalletRef | null {
  return findPrivyEmbeddedWallet(user, "solana");
}
