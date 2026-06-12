"use client";

import { useEffect, useRef } from "react";
import { useAgentWallet } from "@/components/wallet/AgentWalletProvider";

/**
 * Load multi-token wallet assets once when the profile/settings section opens.
 * Reuses session cache on later visits — no automatic refetch.
 */
export function useProfileWalletData(onLoadAssets: () => void) {
  const { status } = useAgentWallet();
  const hydratedRef = useRef(false);

  useEffect(() => {
    if (status !== "ready" || hydratedRef.current) return;
    hydratedRef.current = true;
    onLoadAssets();
  }, [onLoadAssets, status]);
}
