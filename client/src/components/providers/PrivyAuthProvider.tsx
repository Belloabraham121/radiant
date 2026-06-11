"use client";

import { PrivyProvider } from "@privy-io/react-auth";

const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID;

export function PrivyAuthProvider({ children }: { children: React.ReactNode }) {
  if (!appId) {
    throw new Error("NEXT_PUBLIC_PRIVY_APP_ID is not set");
  }

  return (
    <PrivyProvider
      appId={appId}
      config={{
        loginMethods: ["google", "github", "email"],
        embeddedWallets: {
          ethereum: { createOnLogin: "off" },
          solana: { createOnLogin: "off" },
        },
        appearance: {
          theme: "light",
          showWalletLoginFirst: false,
          walletChainType: "ethereum-only",
        },
      }}
    >
      {children}
    </PrivyProvider>
  );
}
