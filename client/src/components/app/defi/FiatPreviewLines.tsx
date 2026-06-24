"use client";

import type { TransactionFiatPreview } from "@/lib/chat-api";

function formatUsd(value: number | null | undefined): string | null {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return null;
  }
  return `~$${value.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

export function FiatPreviewLines({ fiat }: { fiat: TransactionFiatPreview }) {
  const pay = fiat.legs.find((leg) => leg.role === "pay");
  const receive = fiat.legs.find((leg) => leg.role === "receive");
  const payUsd = pay?.usd_value ?? fiat.total_pay_usd;
  const receiveUsd = receive?.usd_value ?? fiat.total_receive_usd;

  if (payUsd === null && receiveUsd === null) {
    return null;
  }

  return (
    <>
      {payUsd !== null && receiveUsd !== null ? (
        <p className="mt-2 text-sm font-semibold text-[var(--hero-ink)]/70">
          {formatUsd(payUsd)} → {formatUsd(receiveUsd)}
        </p>
      ) : null}
      {fiat.net_usd !== null ? (
        <p className="mt-1 text-xs font-medium text-[var(--hero-ink)]/50">
          Est. net received: {formatUsd(fiat.net_usd)}
        </p>
      ) : null}
    </>
  );
}
