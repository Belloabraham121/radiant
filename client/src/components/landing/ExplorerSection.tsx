"use client";

import { ArrowRight } from "lucide-react";
import { WordReveal } from "./WordReveal";

type ExplorerApp = {
  name: string;
  category: string;
  fee: string;
  uses: string;
  accent: string;
};

const ROW_A: ExplorerApp[] = [
  { name: "SUI ⇄ USDC Swap", category: "swap", fee: "0.3% fee", uses: "1.2k uses", accent: "var(--hero-blue)" },
  { name: "Payroll Bot", category: "payments", fee: "0.1% fee", uses: "847 uses", accent: "var(--hero-coral)" },
  { name: "DCA Weekly", category: "automation", fee: "0.2% fee", uses: "634 uses", accent: "var(--hero-mint)" },
  { name: "Group Vault", category: "savings", fee: "0.15% fee", uses: "412 uses", accent: "var(--hero-violet)" },
];

const ROW_B: ExplorerApp[] = [
  { name: "Prediction Market", category: "markets", fee: "0.5% fee", uses: "2.3k uses", accent: "var(--hero-amber)" },
  { name: "Escrow Deal", category: "escrow", fee: "0.25% fee", uses: "356 uses", accent: "var(--hero-blue)" },
  { name: "Tip Jar", category: "payments", fee: "0% fee", uses: "5.1k uses", accent: "var(--hero-coral)" },
  { name: "Floor Alert", category: "alerts", fee: "0.1% fee", uses: "928 uses", accent: "var(--hero-mint)" },
];

function Card({ app }: { app: ExplorerApp }) {
  return (
    <div className="flex w-72 shrink-0 flex-col gap-3 rounded-3xl border-2 border-[var(--hero-ink)] bg-white p-6 shadow-[5px_5px_0_var(--hero-ink)]">
      <div className="flex items-center justify-between">
        <span
          className="rounded-full px-3 py-1 text-xs font-bold text-white"
          style={{ backgroundColor: app.accent }}
        >
          {app.category}
        </span>
        <span className="text-xs font-bold text-[var(--hero-ink)]/45">{app.uses}</span>
      </div>
      <h3 className="font-heading text-xl font-extrabold tracking-tight">{app.name}</h3>
      <div className="flex items-center justify-between text-sm font-bold">
        <span style={{ color: app.accent }}>{app.fee}</span>
        <span className="text-[var(--hero-ink)]/45">→ creator&apos;s wallet</span>
      </div>
    </div>
  );
}

function Row({ apps, reverse }: { apps: ExplorerApp[]; reverse?: boolean }) {
  const list = [...apps, ...apps, ...apps];
  return (
    <div className="overflow-hidden">
      <div
        className={`flex w-max gap-6 pr-6 ${reverse ? "hero-marquee-reverse" : "hero-marquee-slow"}`}
      >
        {list.map((app, i) => (
          <Card key={`${app.name}-${i}`} app={app} />
        ))}
      </div>
    </div>
  );
}

export function ExplorerSection() {
  return (
    <section className="relative overflow-hidden bg-[var(--hero-bg)] py-28 text-[var(--hero-ink)] md:py-40">
      <div className="mx-auto max-w-6xl px-6">
        <p className="mb-6 text-center text-sm font-bold uppercase tracking-[0.25em] text-[var(--hero-ink)]/40">
          The explorer
        </p>
        <WordReveal
          text="Built once. Earning forever."
          className="mx-auto max-w-3xl text-center font-heading text-4xl font-extrabold leading-[1.05] tracking-tight sm:text-5xl md:text-6xl"
        />
        <p className="mx-auto mt-6 max-w-xl text-center text-base font-medium leading-relaxed text-[var(--hero-ink)]/65 md:text-lg">
          Every app on the explorer is live, permanent, and callable — by people and by other
          agents. Creators earn a fee on every single use.
        </p>
      </div>

      <div className="mt-16 flex flex-col gap-6">
        <Row apps={ROW_A} />
        <Row apps={ROW_B} reverse />
      </div>

      <div className="mt-16 flex justify-center">
        <a
          href="#"
          className="group flex items-center gap-2 rounded-full border-2 border-[var(--hero-ink)] bg-white px-8 py-4 text-base font-bold shadow-[5px_5px_0_var(--hero-violet)] transition-transform hover:-translate-y-1"
        >
          Browse the explorer
          <ArrowRight className="size-5 transition-transform group-hover:translate-x-1" />
        </a>
      </div>
    </section>
  );
}
