import type { ExecutionProgressStep } from "../../agent/execution-progress.types.js";
import { isSameChainLifiRoute } from "./lifi-tracking.js";
import type { LifiTrackingMeta } from "./lifi-tracking.types.js";

export type LifiCountdownKind = "bridge" | "swap";

export function lifiCountdownKind(
  tracking: Pick<
    LifiTrackingMeta,
    "from_chain_id" | "to_chain_id" | "from_evm_chain_id" | "to_evm_chain_id"
  >,
): LifiCountdownKind {
  return isSameChainLifiRoute(tracking as LifiTrackingMeta) ? "swap" : "bridge";
}

export function lifiCountdownVerb(
  kind: LifiCountdownKind,
  tense: "progress" | "done" | "failed",
): string {
  if (kind === "swap") {
    if (tense === "done") return "Swapped";
    if (tense === "failed") return "Swap failed";
    return "Swapping";
  }
  if (tense === "done") return "Bridged";
  if (tense === "failed") return "Bridge failed";
  return "Bridging";
}

/** Static fallback when countdown anchor is unavailable (legacy in-flight txs). */
export function formatLifiStaticEtaLabel(
  seconds: number | null | undefined,
  kind: LifiCountdownKind = "bridge",
): string {
  const verb = lifiCountdownVerb(kind, "progress");
  if (seconds == null || seconds <= 0) {
    return verb;
  }
  if (seconds < 60) {
    return `${verb} (~${Math.max(1, Math.round(seconds))}s)`;
  }
  const minutes = Math.max(1, Math.round(seconds / 60));
  return `${verb} (~${minutes}m)`;
}

export function ensureBridgeStartedAt(tracking: LifiTrackingMeta): LifiTrackingMeta {
  if (tracking.bridge_started_at) {
    return tracking;
  }
  return {
    ...tracking,
    bridge_started_at: new Date().toISOString(),
  };
}

export function lifiCountdownStepFields(
  tracking: LifiTrackingMeta,
): Pick<
  ExecutionProgressStep,
  "estimated_duration_seconds" | "bridge_started_at" | "countdown_kind"
> {
  const kind = lifiCountdownKind(tracking);
  return {
    estimated_duration_seconds: tracking.estimated_duration_seconds,
    bridge_started_at: tracking.bridge_started_at,
    countdown_kind: kind,
  };
}

export function lifiBridgeStepLabel(
  tracking: LifiTrackingMeta,
  phase: "running" | "done" | "failed",
): string {
  const kind = lifiCountdownKind(tracking);
  if (phase === "running") {
    if (
      tracking.estimated_duration_seconds != null &&
      tracking.estimated_duration_seconds > 0 &&
      tracking.bridge_started_at
    ) {
      return lifiCountdownVerb(kind, "progress");
    }
    return formatLifiStaticEtaLabel(tracking.estimated_duration_seconds, kind);
  }
  return lifiCountdownVerb(kind, phase === "done" ? "done" : "failed");
}
