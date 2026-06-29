"use client";

import type { ReactNode } from "react";
import type { FeatureFlagId } from "@/lib/features";
import { useFeatureEnabled } from "@/lib/feature-flags-context";

export function FeatureGate({
  flag,
  children,
  fallback = null,
}: {
  flag: FeatureFlagId;
  children: ReactNode;
  fallback?: ReactNode;
}) {
  const enabled = useFeatureEnabled(flag);

  if (!enabled) {
    return fallback;
  }

  return children;
}
