"use client";

import Image from "next/image";
import { useReducedMotion } from "./useReducedMotion";

type Protocol = {
  name: string;
  logo: string;
  /** Wordmarks need more horizontal room inside the circle */
  wide?: boolean;
};

const PROTOCOLS: Protocol[] = [
  { name: "Base", logo: "/logos/base.png" },
  { name: "Limitless", logo: "/logos/limitless.svg", wide: true },
  { name: "Uniswap", logo: "/logos/uniswap.png" },
  { name: "Aave", logo: "/logos/aave.png" },
  { name: "Aerodrome Finance", logo: "/logos/aerodrome.png" },
  { name: "Morpho", logo: "/logos/morpho.png" },
  { name: "Beefy", logo: "/logos/beefy.png" },
];

function ProtocolChip({ p }: { p: Protocol }) {
  return (
    <li
      className="flex size-28 shrink-0 items-center justify-center rounded-full border border-white/20 bg-white/[0.06] shadow-[0_0_0_1px_rgba(255,255,255,0.04)_inset] backdrop-blur-sm sm:size-32 md:size-36"
      title={p.name}
    >
      <Image
        src={p.logo}
        alt={p.name}
        width={p.wide ? 140 : 96}
        height={96}
        unoptimized
        className={`object-contain opacity-95 ${
          p.wide
            ? "h-12 w-[4.5rem] sm:h-14 sm:w-24"
            : "size-16 sm:size-20 md:size-24"
        }`}
      />
    </li>
  );
}

function ProtocolTrack({ prefix }: { prefix: string }) {
  return (
    <ul className="flex items-center gap-6 sm:gap-8">
      {PROTOCOLS.map((p) => (
        <ProtocolChip key={`${prefix}-${p.name}`} p={p} />
      ))}
    </ul>
  );
}

export function EcosystemStrip() {
  const reduced = useReducedMotion();

  return (
    <section
      id="ecosystem"
      className="scroll-mt-24 overflow-hidden border-y border-white/10 bg-black py-14 sm:py-16"
    >
      <div className="mx-auto max-w-5xl px-5 text-center sm:px-8">
        <p className="text-sm font-medium uppercase tracking-[0.18em] text-white/40">
          Seamlessly composable with the entire Base economy
        </p>
      </div>

      <div className="relative mt-10">
        <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-20 bg-linear-to-r from-black to-transparent sm:w-36" />
        <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-20 bg-linear-to-l from-black to-transparent sm:w-36" />

        {reduced ? (
          <ul className="flex flex-wrap items-center justify-center gap-5 px-5">
            {PROTOCOLS.map((p) => (
              <ProtocolChip key={p.name} p={p} />
            ))}
          </ul>
        ) : (
          <div className="overflow-hidden">
            {/* Doubled track + reverse marquee = seamless left → right loop */}
            <div className="flex w-max gap-6 hero-marquee-reverse will-change-transform sm:gap-8">
              <ProtocolTrack prefix="a" />
              <div aria-hidden>
                <ProtocolTrack prefix="b" />
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
