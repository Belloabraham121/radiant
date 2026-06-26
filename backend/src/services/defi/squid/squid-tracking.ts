import type { ChainId, TxResult } from "../../chains/types.js";
import { parseChainId } from "../../chains/registry.js";
import type { SquidTrackingMeta } from "./squid-tracking.types.js";
import type {
  SquidChainflipBridgeType,
  SquidChainflipDepositInfo,
  SquidCrossChainStatusResult,
  SquidExecuteResult,
} from "./squid.types.js";

const TERMINAL_SQUID_STATUSES = new Set([
  "SUCCESS",
  "PARTIAL_SUCCESS",
  "FAILED",
  "NOT_FOUND",
]);

export function isTerminalSquidStatus(status: string | null | undefined): boolean {
  return status != null && TERMINAL_SQUID_STATUSES.has(status);
}

export function isSquidPendingEffectsStatus(
  effectsStatus: string | null | undefined,
): boolean {
  return effectsStatus === "pending" || effectsStatus === "unknown";
}

export function shouldEnqueueSquidCrossChainTracking(
  result: TxResult,
  tracking: SquidTrackingMeta | null,
): tracking is SquidTrackingMeta {
  if (!tracking || result.effects_status === "failure") {
    return false;
  }
  if (tracking.from_chain_id === tracking.to_chain_id) {
    if (tracking.from_chain_id === "ethereum") {
      if (tracking.from_evm_chain_id === tracking.to_evm_chain_id) {
        return false;
      }
    } else {
      return false;
    }
  }
  return isSquidPendingEffectsStatus(result.effects_status);
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

export function isSquidCrossChainExecuteParams(params: Record<string, unknown>): boolean {
  if (params.provider_id === "evm-squid") {
    return true;
  }
  const routeId = params.route_id;
  return typeof routeId === "string" && routeId.startsWith("squid:");
}

function readChainflipDeposit(value: unknown): SquidChainflipDepositInfo | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const record = value as Partial<SquidChainflipDepositInfo>;
  if (
    typeof record.deposit_address !== "string" ||
    typeof record.amount !== "string" ||
    typeof record.chainflip_status_tracking_id !== "string" ||
    (record.bridge_type !== "chainflip" && record.bridge_type !== "chainflipmultihop")
  ) {
    return null;
  }
  return {
    deposit_address: record.deposit_address,
    amount: record.amount,
    chainflip_status_tracking_id: record.chainflip_status_tracking_id,
    bridge_type: record.bridge_type,
  };
}

export function buildSquidTrackingMeta(
  params: Record<string, unknown>,
  executeResult: SquidExecuteResult,
): SquidTrackingMeta {
  const fromChain = readChainId(params.from_chain_id) ?? "ethereum";
  const toChain = readChainId(params.to_chain_id) ?? fromChain;
  const chainflipDeposit =
    executeResult.chainflip_deposit ?? readChainflipDeposit(params.chainflip_deposit);
  const chainflipTrackingId =
    chainflipDeposit?.chainflip_status_tracking_id ??
    executeResult.chainflip_status_tracking_id ??
    null;
  const bridgeType: SquidChainflipBridgeType | null =
    chainflipDeposit?.bridge_type ?? executeResult.bridge_type ?? null;
  const txHash = executeResult.tx_hashes[0] ?? null;
  const statusTransactionId = chainflipTrackingId ?? txHash;

  return {
    route_id: executeResult.route_id,
    quote_id: executeResult.quote_id,
    request_id: executeResult.request_id,
    transaction_id: statusTransactionId,
    tx_hashes: executeResult.tx_hashes,
    from_chain_id: fromChain,
    to_chain_id: toChain,
    ...(readNumber(params.from_evm_chain_id) !== undefined
      ? { from_evm_chain_id: readNumber(params.from_evm_chain_id) }
      : {}),
    ...(readNumber(params.to_evm_chain_id) !== undefined
      ? { to_evm_chain_id: readNumber(params.to_evm_chain_id) }
      : {}),
    estimated_duration_seconds:
      readNumber(executeResult.estimated_duration_seconds) ??
      readNumber(params.estimated_duration_seconds) ??
      null,
    bridge_started_at: executeResult.bridge_started_at,
    tracking_status: executeResult.effects_status === "pending" ? "PENDING" : null,
    substatus: null,
    substatus_message: null,
    receiving_tx_hash: null,
    ...(bridgeType ? { bridge_type: bridgeType } : {}),
    ...(chainflipTrackingId ? { chainflip_status_tracking_id: chainflipTrackingId } : {}),
    ...(chainflipDeposit ? { chainflip_deposit: chainflipDeposit } : {}),
  };
}

export function txResultFromSquidExecute(input: {
  chain_id: ChainId;
  address: string;
  digest: string;
  evm_chain_id?: number;
  params: Record<string, unknown>;
  executeResult: SquidExecuteResult;
}): TxResult {
  const tracking = buildSquidTrackingMeta(input.params, input.executeResult);
  const effectsStatus =
    input.executeResult.effects_status === "success"
      ? "success"
      : input.executeResult.effects_status === "failure"
        ? "failure"
        : input.executeResult.effects_status === "pending"
          ? "pending"
          : "unknown";

  return attachSquidMetaToTxResult(
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

export function attachSquidMetaToTxResult(result: TxResult, tracking: SquidTrackingMeta): TxResult {
  return {
    ...result,
    squid: tracking,
  };
}

export function readSquidTrackingFromTxResult(
  result: TxResult | null | undefined,
): SquidTrackingMeta | null {
  if (!result?.squid || typeof result.squid !== "object") {
    return null;
  }
  const squid = result.squid as Partial<SquidTrackingMeta>;
  if (typeof squid.route_id !== "string" || typeof squid.quote_id !== "string") {
    return null;
  }
  const fromChain = readChainId(squid.from_chain_id);
  const toChain = readChainId(squid.to_chain_id);
  if (!fromChain || !toChain) {
    return null;
  }
  return {
    route_id: squid.route_id,
    quote_id: squid.quote_id,
    request_id: typeof squid.request_id === "string" ? squid.request_id : null,
    transaction_id: typeof squid.transaction_id === "string" ? squid.transaction_id : null,
    tx_hashes: readStringArray(squid.tx_hashes),
    from_chain_id: fromChain,
    to_chain_id: toChain,
    ...(readNumber(squid.from_evm_chain_id) !== undefined
      ? { from_evm_chain_id: readNumber(squid.from_evm_chain_id) }
      : {}),
    ...(readNumber(squid.to_evm_chain_id) !== undefined
      ? { to_evm_chain_id: readNumber(squid.to_evm_chain_id) }
      : {}),
    estimated_duration_seconds: readNumber(squid.estimated_duration_seconds) ?? null,
    bridge_started_at:
      typeof squid.bridge_started_at === "string" ? squid.bridge_started_at : null,
    tracking_status: typeof squid.tracking_status === "string" ? squid.tracking_status : null,
    substatus: typeof squid.substatus === "string" ? squid.substatus : null,
    substatus_message:
      typeof squid.substatus_message === "string" ? squid.substatus_message : null,
    receiving_tx_hash:
      typeof squid.receiving_tx_hash === "string" ? squid.receiving_tx_hash : null,
    ...(readString(squid.bridge_type) === "chainflip" || readString(squid.bridge_type) === "chainflipmultihop"
      ? { bridge_type: readString(squid.bridge_type) as SquidChainflipBridgeType }
      : {}),
    ...(readString(squid.chainflip_status_tracking_id)
      ? { chainflip_status_tracking_id: readString(squid.chainflip_status_tracking_id) }
      : {}),
    ...(readChainflipDeposit(squid.chainflip_deposit)
      ? { chainflip_deposit: readChainflipDeposit(squid.chainflip_deposit) }
      : {}),
  };
}

export function mergeSquidStatusIntoTracking(
  tracking: SquidTrackingMeta,
  status: SquidCrossChainStatusResult,
): SquidTrackingMeta {
  return {
    ...tracking,
    tracking_status: status.status,
    substatus: status.substatus,
    substatus_message: status.substatus_message,
    receiving_tx_hash: status.receiving_tx_hash,
  };
}

export function squidStatusInputFromTracking(tracking: SquidTrackingMeta): {
  transaction_id: string;
  quote_id: string;
  from_chain_id?: ChainId;
  to_chain_id?: ChainId;
  from_evm_chain_id?: number;
  to_evm_chain_id?: number;
  request_id?: string;
  bridge_type?: string;
} {
  const transactionId =
    tracking.chainflip_status_tracking_id ??
    tracking.transaction_id ??
    tracking.tx_hashes[0];
  if (!transactionId) {
    throw new Error("Squid tracking missing source transaction id");
  }
  return {
    transaction_id: transactionId,
    quote_id: tracking.quote_id,
    from_chain_id: tracking.from_chain_id,
    to_chain_id: tracking.to_chain_id,
    ...(tracking.from_evm_chain_id !== undefined
      ? { from_evm_chain_id: tracking.from_evm_chain_id }
      : {}),
    ...(tracking.to_evm_chain_id !== undefined
      ? { to_evm_chain_id: tracking.to_evm_chain_id }
      : {}),
    ...(tracking.request_id ? { request_id: tracking.request_id } : {}),
    ...(tracking.bridge_type ? { bridge_type: tracking.bridge_type } : {}),
  };
}
