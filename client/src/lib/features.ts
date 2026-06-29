export type FeatureFlagId = "canvas";

export type FeatureFlags = Record<FeatureFlagId, boolean>;

export const FEATURE_ENV_KEYS: Record<FeatureFlagId, string> = {
  canvas: "NEXT_PUBLIC_FEATURE_CANVAS_ENABLED",
};

export const DEFAULT_FEATURE_FLAGS: FeatureFlags = {
  canvas: false,
};

function parseEnvEnabled(raw: string): boolean {
  return raw.trim().toLowerCase() === "true";
}

/** Server/middleware check using build-time public env. */
export function isFeatureEnabledFromEnv(id: FeatureFlagId): boolean {
  const key = FEATURE_ENV_KEYS[id];
  const raw = process.env[key];
  if (raw === undefined) {
    return DEFAULT_FEATURE_FLAGS[id];
  }
  return parseEnvEnabled(raw);
}

export function isFeatureEnabled(flags: FeatureFlags, id: FeatureFlagId): boolean {
  return flags[id] ?? false;
}
