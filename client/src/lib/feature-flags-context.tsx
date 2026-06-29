"use client";

import {
  createContext,
  useContext,
  useMemo,
  type ReactNode,
} from "react";
import {
  DEFAULT_FEATURE_FLAGS,
  type FeatureFlagId,
  type FeatureFlags,
} from "@/lib/features";

type FeatureFlagsContextValue = {
  features: FeatureFlags;
  loaded: boolean;
};

const FeatureFlagsContext = createContext<FeatureFlagsContextValue>({
  features: DEFAULT_FEATURE_FLAGS,
  loaded: false,
});

export function FeatureFlagsProvider({
  children,
  features,
  loaded = false,
}: {
  children: ReactNode;
  features?: FeatureFlags | null;
  loaded?: boolean;
}) {
  const value = useMemo(
    () => ({
      features: features ?? DEFAULT_FEATURE_FLAGS,
      loaded,
    }),
    [features, loaded],
  );

  return (
    <FeatureFlagsContext.Provider value={value}>
      {children}
    </FeatureFlagsContext.Provider>
  );
}

export function useFeatureFlags(): FeatureFlagsContextValue {
  return useContext(FeatureFlagsContext);
}

export function useFeatureEnabled(id: FeatureFlagId): boolean {
  const { features } = useFeatureFlags();
  return features[id] ?? false;
}
