"use client";

import { useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";
import { fmtAgo, type AgentTx } from "@/lib/explorer-data";

gsap.registerPlugin(ScrollTrigger, useGSAP);

export function TxTable({ txs, accent }: { txs: AgentTx[]; accent: string }) {
  const ref = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
      gsap.from("[data-tx-row]", {
        x: -28,
        opacity: 0,
        duration: 0.5,
        stagger: 0.07,
        ease: "power3.out",
        scrollTrigger: { trigger: ref.current, start: "top 85%" },
      });
    },
    { scope: ref },
  );

  return (
    <div
      ref={ref}
      className="overflow-hidden rounded-3xl border-2 border-[var(--hero-ink)] bg-white shadow-[6px_6px_0_var(--hero-ink)]"
    >
      <div className="flex items-center justify-between border-b-2 border-[var(--hero-ink)] px-6 py-4">
        <h3 className="font-heading text-lg font-extrabold tracking-tight">Recent transactions</h3>
        <span
          className="hero-blink flex items-center gap-1.5 text-xs font-bold"
          style={{ color: accent }}
        >
          <span className="size-2 rounded-full bg-current" />
          <span className="size-2 rounded-full bg-current" />
          <span className="size-2 rounded-full bg-current" />
          live
        </span>
      </div>
      <div className="divide-y divide-[var(--hero-ink)]/10">
        {txs.map((tx) => (
          <div
            key={tx.hash}
            data-tx-row
            className="grid grid-cols-2 items-center gap-2 px-6 py-3.5 text-sm transition-colors hover:bg-[var(--hero-bg)] sm:grid-cols-[1.2fr_1.4fr_1fr_0.9fr_0.8fr]"
          >
            <span className="font-mono text-xs font-semibold" style={{ color: accent }}>
              {tx.hash}
            </span>
            <span className="font-bold">{tx.action}</span>
            <span className="hidden font-mono text-xs text-[var(--hero-ink)]/45 sm:block">
              {tx.from}
            </span>
            <span className="text-right font-bold sm:text-left">
              {tx.amountSui.toLocaleString("en-US")} SUI
            </span>
            <span className="flex items-center justify-end gap-2 sm:justify-start">
              <span
                className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${
                  tx.status === "success"
                    ? "bg-[var(--hero-mint)]/15 text-[var(--hero-mint)]"
                    : "bg-[var(--hero-amber)]/20 text-[#b97700]"
                }`}
              >
                {tx.status}
              </span>
              <span className="hidden text-xs font-semibold text-[var(--hero-ink)]/40 md:block">
                {fmtAgo(tx.minutesAgo)}
              </span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
