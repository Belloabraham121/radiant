"use client";

import { useEffect, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useFeatureFlags } from "@/lib/feature-flags-context";

export function CanvasFeatureGuard({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { features, loaded } = useFeatureFlags();

  useEffect(() => {
    if (loaded && !features.canvas) {
      router.replace("/app");
    }
  }, [features.canvas, loaded, router]);

  if (!loaded || !features.canvas) {
    return null;
  }

  return children;
}
