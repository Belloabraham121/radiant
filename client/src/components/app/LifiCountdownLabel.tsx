"use client";

import { useEffect, useState } from "react";
import {
  formatLifiCountdownRemaining,
  type LifiCountdownKind,
} from "@/lib/lifi-countdown";

export function LifiCountdownLabel({
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
  const [label, setLabel] = useState(() =>
    formatLifiCountdownRemaining({
      kind,
      startedAt,
      durationSeconds,
    }),
  );

  useEffect(() => {
    const tick = () => {
      setLabel(
        formatLifiCountdownRemaining({
          kind,
          startedAt,
          durationSeconds,
        }),
      );
    };

    tick();
    const intervalId = window.setInterval(tick, 1000);
    return () => window.clearInterval(intervalId);
  }, [kind, startedAt, durationSeconds]);

  return <>{label || fallbackLabel}</>;
}
