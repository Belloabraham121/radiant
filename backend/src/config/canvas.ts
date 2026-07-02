import { getOpenAiConfig } from "./agent.js";
import { optional } from "./optional-env.js";

export type CanvasConfig = {
  runtimeMock: boolean;
  feesDisabled: boolean;
  feeBps: number;
  killSwitchCacheTtlMs: number;
  spendLedgerTtlSeconds: number;
  polymarketCredentialCacheTtlSeconds: number;
};

export function getCanvasConfig(): CanvasConfig {
  const runtimeMockRaw = process.env.CANVAS_RUNTIME_MOCK?.trim().toLowerCase();
  const feesDisabledRaw = process.env.CANVAS_FEES_DISABLED?.trim().toLowerCase();

  return {
    runtimeMock: runtimeMockRaw === "true" || runtimeMockRaw === "1",
    feesDisabled: feesDisabledRaw === "true" || feesDisabledRaw === "1",
    feeBps: Number.parseInt(optional("CANVAS_FEE_BPS", "25"), 10),
    killSwitchCacheTtlMs: Number.parseInt(optional("CANVAS_KILL_SWITCH_CACHE_MS", "500"), 10),
    spendLedgerTtlSeconds: Number.parseInt(optional("CANVAS_SPEND_LEDGER_TTL_SECONDS", "86400"), 10),
    polymarketCredentialCacheTtlSeconds: Number.parseInt(
      optional("POLYMARKET_CREDENTIAL_CACHE_TTL_SECONDS", "3600"),
      10,
    ),
  };
}

export function isCanvasRuntimeMock(): boolean {
  return getCanvasConfig().runtimeMock;
}

export function areCanvasFeesDisabled(): boolean {
  return getCanvasConfig().feesDisabled;
}

/**
 * Whether the Canvas Builder SSE route uses the deterministic stub instead of OpenAI.
 * When OPENAI_API_KEY is set, always use the real builder (CANVAS_BUILDER_STUB is ignored).
 * Without a key, stub is used unless CANVAS_BUILDER_STUB=false.
 */
export function useCanvasBuilderStub(): boolean {
  if (getOpenAiConfig().enabled) {
    return false;
  }
  const explicit = process.env.CANVAS_BUILDER_STUB?.trim().toLowerCase();
  if (explicit === "false" || explicit === "0") {
    return false;
  }
  return true;
}
