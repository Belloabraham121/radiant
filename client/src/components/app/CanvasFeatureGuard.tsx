"use client";

import { Loader2 } from "lucide-react";
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

  if (!loaded) {
    return (
      <div className="flex h-full items-center justify-center gap-2 text-sm font-semibold text-[var(--hero-ink)]/45">
        <Loader2 className="size-5 animate-spin" aria-hidden />
        Loading Canvas…
      </div>
    );
  }

  if (!features.canvas) {
    return null;
  }

  return children;
}
