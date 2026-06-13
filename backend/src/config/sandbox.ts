import { optional } from "./optional-env.js";
import type { SandboxProviderName } from "../services/sandbox/sandbox.provider.js";

export type SandboxConfig = {
  provider: SandboxProviderName;
  e2bTemplateAlias: string;
  sandboxTimeoutMs: number;
  buildCommandTimeoutMs: number;
  maxArtifactBytes: number;
  maxArtifactFiles: number;
};

let cached: SandboxConfig | undefined;

const PROVIDERS: SandboxProviderName[] = ["none", "e2b", "docker", "mock"];

function parseProvider(raw: string): SandboxProviderName {
  const normalized = raw.trim().toLowerCase();
  if (PROVIDERS.includes(normalized as SandboxProviderName)) {
    return normalized as SandboxProviderName;
  }
  return "none";
}

function parsePositiveInt(raw: string, fallback: number): number {
  const value = Number.parseInt(raw, 10);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

export function getSandboxConfig(): SandboxConfig {
  if (cached) return cached;

  cached = {
    provider: parseProvider(optional("SANDBOX_PROVIDER", "none")),
    e2bTemplateAlias: optional("E2B_TEMPLATE_ALIAS", "radiant-build:v1"),
    sandboxTimeoutMs: parsePositiveInt(optional("DEPLOY_SANDBOX_TIMEOUT_MS", "600000"), 600_000),
    buildCommandTimeoutMs: parsePositiveInt(
      optional("DEPLOY_BUILD_COMMAND_TIMEOUT_MS", "300000"),
      300_000,
    ),
    maxArtifactBytes: parsePositiveInt(optional("DEPLOY_MAX_ARTIFACT_BYTES", "524288"), 524_288),
    maxArtifactFiles: parsePositiveInt(optional("DEPLOY_MAX_ARTIFACT_FILES", "50"), 50),
  };

  return cached;
}

export function resetSandboxConfigForTests(): void {
  cached = undefined;
}
