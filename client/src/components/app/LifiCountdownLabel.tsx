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
    let tickCount = 0;
    const tick = () => {
      const nowMs = Date.now();
      const remaining =
        durationSeconds - (nowMs - Date.parse(startedAt)) / 1000;
      setLabel(
        formatLifiCountdownRemaining({
          kind,
          startedAt,
          durationSeconds,
          nowMs,
        }),
      );
      tickCount += 1;
      if (tickCount === 1 || tickCount % 15 === 0) {
        // #region agent log
        fetch("http://127.0.0.1:7538/ingest/5ed43092-4295-4656-995d-39c0019df20f", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Debug-Session-Id": "90234e",
          },
          body: JSON.stringify({
            sessionId: "90234e",
            location: "LifiCountdownLabel.tsx:tick",
            message: "countdown_tick",
            data: {
              startedAt,
              durationSeconds,
              remainingSeconds: Math.max(0, Math.floor(remaining)),
              tickCount,
            },
            timestamp: nowMs,
            runId: "post-fix",
            hypothesisId: "H1-H3",
          }),
        }).catch(() => {});
        // #endregion
      }
    };

    tick();
    const intervalId = window.setInterval(tick, 1000);
    return () => window.clearInterval(intervalId);
  }, [kind, startedAt, durationSeconds]);

  return <>{label || fallbackLabel}</>;
}
