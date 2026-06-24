import type { ChainId, TxResult } from "../../chains/types.js";
import { parseChainId } from "../../chains/registry.js";
import type { LifiTrackingMeta } from "./lifi-tracking.types.js";
import type { CrossChainStatusResult, LifiExecuteResult } from "./lifi.types.js";

const TERMINAL_LIFI_STATUSES = new Set(["DONE", "FAILED", "REFUNDED"]);

export function isTerminalLifiStatus(status: string | null | undefined): boolean {
  return status != null && TERMINAL_LIFI_STATUSES.has(status);
}

export function isLifiPendingEffectsStatus(
  effectsStatus: string | null | undefined,
): boolean {
  return effectsStatus === "pending" || effectsStatus === "unknown";
}

/** Same-chain Li-Fi route (EVM network or Solana/Sui family). */
export function isSameChainLifiRoute(tracking: LifiTrackingMeta): boolean {
  if (tracking.from_chain_id !== tracking.to_chain_id) {
    return false;
  }
  if (tracking.from_chain_id === "ethereum") {
    return tracking.from_evm_chain_id === tracking.to_evm_chain_id;
  }
  return true;
}

/** Shared guard: tracking exists and execute did not hard-fail. */
function isLifiTrackingCandidate(
  result: TxResult,
  tracking: LifiTrackingMeta | null,
): tracking is LifiTrackingMeta {
  if (!tracking) {
    return false;
  }
  return result.effects_status !== "failure";
}

/** Cross-chain Li-Fi bridge routes with pending confirmation. */
export function shouldEnqueueLifiCrossChainTracking(
  result: TxResult,
  tracking: LifiTrackingMeta | null,
): tracking is LifiTrackingMeta {
  if (!isLifiTrackingCandidate(result, tracking)) {
    return false;
  }
  if (isSameChainLifiRoute(tracking)) {
    return false;
  }
  return isLifiPendingEffectsStatus(result.effects_status);
}

/** Same-chain Li-Fi swap routes that still need status polling. */
export function shouldEnqueueLifiSwapTracking(
  result: TxResult,
  tracking: LifiTrackingMeta | null,
): tracking is LifiTrackingMeta {
  if (!isLifiTrackingCandidate(result, tracking)) {
    return false;
  }
  if (!isSameChainLifiRoute(tracking)) {
    return false;
  }
  if (isLifiPendingEffectsStatus(result.effects_status)) {
    return true;
  }
  return !isTerminalLifiStatus(tracking.tracking_status);
}

export function formatLifiEtaLabel(seconds: number | null | undefined): string {
  if (seconds == null || seconds <= 0) {
    return "Bridging";
  }
  if (seconds < 60) {
    return `Bridging (~${Math.max(1, Math.round(seconds))}s)`;
  }
  const minutes = Math.max(1, Math.round(seconds / 60));
  return `Bridging (~${minutes}m)`;
}

function readChainId(value: unknown): ChainId | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  try {
    return parseChainId(value);
  } catch {
    return undefined;
  }
}

function readNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is string => typeof item === "string" && item.length > 0);
}

function readBridges(params: Record<string, unknown>): string | null {
  const bridges = params.bridges;
  if (Array.isArray(bridges) && typeof bridges[0] === "string") {
    return bridges[0];
  }
  const tool = readString(params.tool);
  return tool ?? null;
}

export function buildLifiTrackingMeta(
  params: Record<string, unknown>,
  executeResult: LifiExecuteResult,
): LifiTrackingMeta {
  const fromChain = readChainId(params.from_chain_id) ?? "ethereum";
  const toChain = readChainId(params.to_chain_id) ?? fromChain;

  return {
    route_id: executeResult.route_id,
    tx_hashes: executeResult.tx_hashes,
    from_chain_id: fromChain,
    to_chain_id: toChain,
    ...(readNumber(params.from_evm_chain_id) !== undefined
      ? { from_evm_chain_id: readNumber(params.from_evm_chain_id) }
      : {}),
    ...(readNumber(params.to_evm_chain_id) !== undefined
      ? { to_evm_chain_id: readNumber(params.to_evm_chain_id) }
      : {}),
    bridge_tool: readBridges(params),
    estimated_duration_seconds: readNumber(params.estimated_duration_seconds) ?? null,
    tracking_status: executeResult.effects_status === "pending" ? "PENDING" : null,
    substatus: null,
    substatus_message: null,
    receiving_tx_hash: null,
  };
}

export function txResultFromLifiExecute(input: {
  chain_id: ChainId;
  address: string;
  digest: string;
  evm_chain_id?: number;
  params: Record<string, unknown>;
  executeResult: LifiExecuteResult;
}): TxResult {
  const tracking = buildLifiTrackingMeta(input.params, input.executeResult);
  const effectsStatus =
    input.executeResult.effects_status === "success"
      ? "success"
      : input.executeResult.effects_status === "failure"
        ? "failure"
        : input.executeResult.effects_status === "pending"
          ? "pending"
          : "unknown";

  return attachLifiMetaToTxResult(
    {
      chain_id: input.chain_id,
      address: input.address,
      digest: input.digest,
      effects_status: effectsStatus,
      ...(input.evm_chain_id !== undefined ? { evm_chain_id: input.evm_chain_id } : {}),
    },
    tracking,
  );
}

export function attachLifiMetaToTxResult(
  result: TxResult,
  tracking: LifiTrackingMeta,
): TxResult {
  return {
    ...result,
    lifi: tracking,
  };
}

export function readLifiTrackingFromTxResult(result: TxResult | null | undefined): LifiTrackingMeta | null {
  if (!result?.lifi || typeof result.lifi !== "object") {
    return null;
  }
  const lifi = result.lifi as Partial<LifiTrackingMeta>;
  if (typeof lifi.route_id !== "string" || !Array.isArray(lifi.tx_hashes)) {
    return null;
  }
  const fromChain = readChainId(lifi.from_chain_id);
  const toChain = readChainId(lifi.to_chain_id);
  if (!fromChain || !toChain) {
    return null;
  }
  return {
    route_id: lifi.route_id,
    tx_hashes: readStringArray(lifi.tx_hashes),
    from_chain_id: fromChain,
    to_chain_id: toChain,
    ...(readNumber(lifi.from_evm_chain_id) !== undefined
      ? { from_evm_chain_id: readNumber(lifi.from_evm_chain_id) }
      : {}),
    ...(readNumber(lifi.to_evm_chain_id) !== undefined
      ? { to_evm_chain_id: readNumber(lifi.to_evm_chain_id) }
      : {}),
    bridge_tool: typeof lifi.bridge_tool === "string" ? lifi.bridge_tool : null,
    estimated_duration_seconds:
      readNumber(lifi.estimated_duration_seconds) ?? null,
    tracking_status: typeof lifi.tracking_status === "string" ? lifi.tracking_status : null,
    substatus: typeof lifi.substatus === "string" ? lifi.substatus : null,
    substatus_message:
      typeof lifi.substatus_message === "string" ? lifi.substatus_message : null,
    receiving_tx_hash:
      typeof lifi.receiving_tx_hash === "string" ? lifi.receiving_tx_hash : null,
  };
}

export function mergeLifiStatusIntoTracking(
  tracking: LifiTrackingMeta,
  status: CrossChainStatusResult,
): LifiTrackingMeta {
  return {
    ...tracking,
    tracking_status: status.status,
    substatus: status.substatus ?? null,
    substatus_message: status.substatus_message,
    receiving_tx_hash: status.receiving_tx_hash,
    bridge_tool: status.tool ?? tracking.bridge_tool,
  };
}

export function buildCrossChainRoutesToolResult(params: Record<string, unknown>): Record<string, unknown> {
  return {
    routes: [
      {
        route_id: readString(params.route_id),
        from_chain_id: params.from_chain_id,
        to_chain_id: params.to_chain_id,
        from_evm_chain_id: params.from_evm_chain_id,
        to_evm_chain_id: params.to_evm_chain_id,
        from_token_symbol: params.from_token_symbol ?? params.from_token,
        to_token_symbol: params.to_token_symbol ?? params.to_token,
        from_amount_atomic: params.from_amount_atomic,
        to_amount_atomic: params.to_amount_atomic,
        bridges: params.bridges,
        estimated_duration_seconds: params.estimated_duration_seconds,
        fee_cost_usd: params.fee_cost_usd,
        gas_cost_usd: params.gas_cost_usd,
        expires_at: params.expires_at ?? params.quote_expires_at,
      },
    ],
  };
}

export function lifiStatusInputFromTracking(tracking: LifiTrackingMeta): {
  tx_hash: string;
  from_chain_id?: ChainId;
  to_chain_id?: ChainId;
  from_evm_chain_id?: number;
  to_evm_chain_id?: number;
  bridge?: string;
} {
  const txHash = tracking.tx_hashes[0];
  if (!txHash) {
    throw new Error("Li-Fi tracking missing source tx hash");
  }
  return {
    tx_hash: txHash,
    from_chain_id: tracking.from_chain_id,
    to_chain_id: tracking.to_chain_id,
    ...(tracking.from_evm_chain_id !== undefined
      ? { from_evm_chain_id: tracking.from_evm_chain_id }
      : {}),
    ...(tracking.to_evm_chain_id !== undefined
      ? { to_evm_chain_id: tracking.to_evm_chain_id }
      : {}),
    ...(tracking.bridge_tool ? { bridge: tracking.bridge_tool } : {}),
  };
}
