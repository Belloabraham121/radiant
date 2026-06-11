import type { User } from "@privy-io/react-auth";

export type PrivySuiWalletRef = {
  privyWalletId: string;
  address: string;
};

function isPrivyEmbeddedWallet(account: {
  walletClientType?: string;
}): boolean {
  return (
    account.walletClientType === "privy" || account.walletClientType === "privy-v2"
  );
}

/** Privy embedded Sui agent wallet from the user's linked accounts. */
export function findPrivySuiWallet(user: User | null): PrivySuiWalletRef | null {
  if (!user) return null;

  for (const account of user.linkedAccounts) {
    if (account.type !== "wallet") continue;
    if (account.chainType !== "sui") continue;
    if (!isPrivyEmbeddedWallet(account)) continue;
    if (!account.id) continue;

    return {
      privyWalletId: account.id,
      address: account.address,
    };
  }

  return null;
}
