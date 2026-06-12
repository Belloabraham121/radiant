"use client";

import { PrivyProvider } from "@privy-io/react-auth";
import { getAppOAuthRedirectUrl } from "@/lib/privy-oauth";

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
        customOAuthRedirectUrl: getAppOAuthRedirectUrl(),
        embeddedWallets: {
          ethereum: { createOnLogin: "off" },
          solana: { createOnLogin: "off" },
        },
        appearance: {
          theme: "light",
          showWalletLoginFirst: false,
        },
      }}
    >
      {children}
    </PrivyProvider>
  );
}
