export type LifiCountdownKind = "bridge" | "swap";

export function formatCountdownClock(totalSeconds: number): string {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  }
  return `${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

function countdownVerb(kind: LifiCountdownKind): string {
  return kind === "swap" ? "Swapping" : "Bridging";
}

/** Static fallback when countdown anchor is unavailable (legacy in-flight txs). */
export function formatLifiStaticEtaLabel(
  seconds: number | null | undefined,
  kind: LifiCountdownKind = "bridge",
): string {
  const verb = countdownVerb(kind);
  if (seconds == null || seconds <= 0) {
    return verb;
  }
  if (seconds < 60) {
    return `${verb} (~${Math.max(1, Math.round(seconds))}s)`;
  }
  const minutes = Math.max(1, Math.round(seconds / 60));
  return `${verb} (~${minutes}m)`;
}

export function formatLifiCountdownRemaining(input: {
  kind: LifiCountdownKind;
  startedAt: string;
  durationSeconds: number;
  nowMs?: number;
}): string {
  const verb = countdownVerb(input.kind);
  const elapsedSeconds =
    ((input.nowMs ?? Date.now()) - Date.parse(input.startedAt)) / 1000;
  const remaining = input.durationSeconds - elapsedSeconds;

  if (remaining <= 0) {
    return `${verb} · taking longer than expected`;
  }

  return `${verb} · ${formatCountdownClock(remaining)} remaining`;
}

export function lifiBridgeStepLabel(input: {
  kind: LifiCountdownKind;
  phase: "running" | "done" | "failed";
  estimatedDurationSeconds?: number | null;
  bridgeStartedAt?: string | null;
}): string {
  if (input.phase === "done") {
    return input.kind === "swap" ? "Swapped" : "Bridged";
  }
  if (input.phase === "failed") {
    return input.kind === "swap" ? "Swap failed" : "Bridge failed";
  }
  if (
    input.estimatedDurationSeconds != null &&
    input.estimatedDurationSeconds > 0 &&
    input.bridgeStartedAt
  ) {
    return countdownVerb(input.kind);
  }
  return formatLifiStaticEtaLabel(input.estimatedDurationSeconds, input.kind);
}

export function isSameChainLifiRoute(input: {
  fromChainId?: string;
  toChainId?: string;
  fromEvmChainId?: number;
  toEvmChainId?: number;
}): boolean {
  if (!input.fromChainId || !input.toChainId || input.fromChainId !== input.toChainId) {
    return false;
  }
  if (input.fromChainId === "ethereum") {
    return input.fromEvmChainId === input.toEvmChainId;
  }
  return true;
}

export function lifiCountdownKind(input: {
  fromChainId?: string;
  toChainId?: string;
  fromEvmChainId?: number;
  toEvmChainId?: number;
}): LifiCountdownKind {
  return isSameChainLifiRoute(input) ? "swap" : "bridge";
}

export function executionStepHasLifiCountdown(step: {
  id: string;
  status: string;
  estimatedDurationSeconds?: number | null;
  bridgeStartedAt?: string | null;
}): boolean {
  return (
    step.id === "lifi-bridge" &&
    step.status === "running" &&
    step.estimatedDurationSeconds != null &&
    step.estimatedDurationSeconds > 0 &&
    Boolean(step.bridgeStartedAt)
  );
}
