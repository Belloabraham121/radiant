import { optional } from "./optional-env.js";

export const FEATURE_DEFINITIONS = {
  canvas: {
    envKey: "FEATURE_CANVAS_ENABLED",
    defaultEnabled: false,
  },
} as const;

export type FeatureFlagId = keyof typeof FEATURE_DEFINITIONS;
export type FeatureFlags = Record<FeatureFlagId, boolean>;

function parseEnvEnabled(raw: string): boolean {
  return raw.trim().toLowerCase() === "true";
}

export function getFeatureFlags(): FeatureFlags {
  const flags = {} as FeatureFlags;

  for (const id of Object.keys(FEATURE_DEFINITIONS) as FeatureFlagId[]) {
    const def = FEATURE_DEFINITIONS[id];
    const fallback = def.defaultEnabled ? "true" : "false";
    flags[id] = parseEnvEnabled(optional(def.envKey, fallback));
  }

  return flags;
}

export function isFeatureEnabled(id: FeatureFlagId): boolean {
  return getFeatureFlags()[id];
}
