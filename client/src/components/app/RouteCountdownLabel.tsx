"use client";

import {
  formatLifiCountdownRemaining,
  type LifiCountdownKind,
} from "@/lib/lifi-countdown";
import { LifiCountdownLabel } from "@/components/app/LifiCountdownLabel";

/** Countdown label for cross-chain bridge/swap steps (Li-Fi and alternate routes). */
export function RouteCountdownLabel({
  kind,
  startedAt,
  durationSeconds,
  fallbackLabel,
}: {
  kind: LifiCountdownKind;
  startedAt: string;
  durationSeconds: number;
  fallbackLabel: string;
}) {
  return (
    <LifiCountdownLabel
      kind={kind}
      startedAt={startedAt}
      durationSeconds={durationSeconds}
      fallbackLabel={fallbackLabel}
    />
  );
}

/** Quote expiry countdown for DeFi approval bars (Soroswap, Li-Fi, Squid). */
export function QuoteExpiryCountdownLabel({
  label,
  prefix = "Quote valid for",
}: {
  label: string;
  prefix?: string;
}) {
  return (
    <>
      {prefix} {label}
    </>
  );
}

export { formatLifiCountdownRemaining as formatRouteCountdownRemaining };
