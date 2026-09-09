const STEPS = [
  {
    n: "01",
    title: "State Your Intent",
    body: "Use the universal command bar at the bottom of your screen. Tell Radiant exactly what you want to achieve, in plain English.",
    graphic: "intent" as const,
  },
  {
    n: "02",
    title: "Watch It Morph",
    body: "The engine instantly compiles verified, safe OnchainKit components—rendering live prediction charts, news feeds, order books, and Twitter sentiment directly onto your canvas.",
    graphic: "morph" as const,
  },
  {
    n: "03",
    title: "Execute or Delegate",
    body: 'Click "Confirm" to execute the trade yourself using your Coinbase Smart Wallet, or instruct your personal AI Agent to manage the position automatically based on your parameters.',
    graphic: "execute" as const,
  },
] as const;

function StepGraphic({ kind }: { kind: (typeof STEPS)[number]["graphic"] }) {
  if (kind === "intent") {
    return (
      <svg viewBox="0 0 240 140" className="h-auto w-full" aria-hidden>
        <rect
          x="16"
          y="88"
          width="208"
          height="36"
          rx="18"
          fill="rgba(255,255,255,0.04)"
          stroke="rgba(255,255,255,0.14)"
        />
        <circle cx="36" cy="106" r="5" fill="hsl(195,100%,50%)" />
        <rect
          x="50"
          y="100"
          width="120"
          height="6"
          rx="3"
          fill="rgba(255,255,255,0.35)"
        />
        <rect
          x="50"
          y="110"
          width="72"
          height="4"
          rx="2"
          fill="rgba(255,255,255,0.15)"
        />
        <path
          d="M120 78 C120 52 96 40 72 48"
          stroke="hsl(193,85%,66%)"
          strokeWidth="1.5"
          strokeDasharray="4 4"
          fill="none"
          opacity="0.7"
        />
        <circle cx="72" cy="46" r="10" fill="hsla(195,100%,50%,0.2)" stroke="hsl(195,100%,50%)" />
        <text
          x="72"
          y="50"
          textAnchor="middle"
          fill="hsl(196,100%,83%)"
          fontSize="10"
          fontFamily="system-ui"
        >
          AI
        </text>
      </svg>
    );
  }

  if (kind === "morph") {
    return (
      <svg viewBox="0 0 240 140" className="h-auto w-full" aria-hidden>
        <rect
          x="20"
          y="24"
          width="70"
          height="52"
          rx="10"
          fill="rgba(255,255,255,0.04)"
          stroke="hsla(195,100%,50%,0.45)"
        />
        <path
          d="M30 58 C42 50 50 40 62 42 C70 44 76 52 82 48"
          stroke="hsl(195,100%,50%)"
          strokeWidth="2"
          fill="none"
        />
        <rect
          x="102"
          y="24"
          width="54"
          height="52"
          rx="10"
          fill="rgba(255,255,255,0.04)"
          stroke="rgba(255,255,255,0.12)"
        />
        <rect x="112" y="36" width="34" height="4" rx="2" fill="rgba(255,255,255,0.25)" />
        <rect x="112" y="46" width="28" height="4" rx="2" fill="rgba(255,255,255,0.15)" />
        <rect x="112" y="56" width="22" height="4" rx="2" fill="rgba(255,255,255,0.1)" />
        <rect
          x="168"
          y="24"
          width="52"
          height="52"
          rx="10"
          fill="rgba(255,255,255,0.04)"
          stroke="hsla(193,85%,66%,0.4)"
        />
        <circle
          cx="194"
          cy="50"
          r="14"
          stroke="hsl(193,85%,66%)"
          strokeWidth="3"
          strokeDasharray="60 28"
          fill="none"
        />
        <path
          d="M55 90 H185"
          stroke="rgba(255,255,255,0.12)"
          strokeWidth="2"
          strokeDasharray="6 6"
        />
        <circle cx="55" cy="90" r="4" fill="hsl(195,100%,50%)" />
        <circle cx="120" cy="90" r="4" fill="hsl(193,85%,66%)" />
        <circle cx="185" cy="90" r="4" fill="hsl(196,100%,83%)" />
        <text
          x="120"
          y="118"
          textAnchor="middle"
          fill="rgba(255,255,255,0.4)"
          fontSize="10"
          fontFamily="system-ui"
        >
          components compile live
        </text>
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 240 140" className="h-auto w-full" aria-hidden>
      <rect
        x="40"
        y="28"
        width="160"
        height="84"
        rx="16"
        fill="rgba(255,255,255,0.04)"
        stroke="rgba(255,255,255,0.12)"
      />
      <rect
        x="58"
        y="48"
        width="88"
        height="10"
        rx="5"
        fill="rgba(255,255,255,0.2)"
      />
      <rect
        x="58"
        y="66"
        width="64"
        height="6"
        rx="3"
        fill="rgba(255,255,255,0.1)"
      />
      <rect
        x="58"
        y="86"
        width="72"
        height="14"
        rx="7"
        fill="hsl(195,100%,50%)"
      />
      <text
        x="94"
        y="96"
        textAnchor="middle"
        fill="#000"
        fontSize="9"
        fontWeight="700"
        fontFamily="system-ui"
      >
        Confirm
      </text>
      <circle cx="168" cy="56" r="16" fill="hsla(193,85%,66%,0.15)" stroke="hsl(193,85%,66%)" />
      <path
        d="M160 56 L166 62 L178 48"
        stroke="hsl(193,85%,66%)"
        strokeWidth="2.5"
        fill="none"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function HowItWorksWaitlist() {
  return (
    <section className="border-t border-white/10 bg-black px-5 py-20 sm:px-8 sm:py-28">
      <div className="mx-auto max-w-5xl">
        <h2 className="font-(family-name:--font-instrument-serif) text-3xl tracking-tight text-white sm:text-5xl md:text-6xl">
          From Intent to Execution in Seconds
        </h2>

        <ol className="mt-14 grid gap-8 sm:grid-cols-3 sm:gap-6">
          {STEPS.map((step) => (
            <li
              key={step.n}
              className="overflow-hidden rounded-3xl border border-white/10 bg-white/[0.03]"
            >
              <div className="border-b border-white/8 bg-linear-to-br from-[hsla(195,100%,50%,0.12)] to-transparent px-3 pt-3">
                <StepGraphic kind={step.graphic} />
              </div>
              <div className="p-5">
                <span className="font-(family-name:--font-instrument-serif) text-3xl text-[hsl(195,100%,50%)]/40">
                  {step.n}
                </span>
                <h3 className="mt-2 text-lg font-semibold text-white">
                  {step.title}
                </h3>
                <p className="mt-3 text-sm leading-relaxed text-white/55">
                  {step.body}
                </p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
