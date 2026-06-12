"use client";

import { useLogout } from "@privy-io/react-auth";
import { useRouter } from "next/navigation";
import { useCallback, useRef, useState } from "react";
import { logoutSession } from "@/lib/auth-api";

export function useAuthLogout() {
  const router = useRouter();
  const { logout: privyLogout } = useLogout();
  const [loggingOut, setLoggingOut] = useState(false);
  const inFlightRef = useRef(false);

  const logout = useCallback(async () => {
    if (inFlightRef.current) {
      return;
    }
    inFlightRef.current = true;
    setLoggingOut(true);

    try {
      try {
        await logoutSession();
      } catch {
        // Privy logout still runs if backend cookies were already cleared.
      }
      await privyLogout();
      router.replace("/auth");
    } finally {
      inFlightRef.current = false;
      setLoggingOut(false);
    }
  }, [privyLogout, router]);

  return { logout, loggingOut };
}
