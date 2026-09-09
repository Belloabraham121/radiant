const FEATURES = [
  {
    title: "Infinite Customization",
    body: "Need a highly specific layout? Drag, drop, and refine the AI-generated components. Connect a Limitless prediction market directly to a CoinDesk news feed and X (Twitter) sentiment tracker on one unified screen.",
    graphic: "customize" as const,
  },
  {
    title: "Smart Automation & Delegation",
    body: "Don't just track the market; conquer it. Command your AI agent to monitor yields on Beefy, execute limit orders on Aerodrome, or trigger a merchant checkout based on specific onchain events.",
    graphic: "automate" as const,
  },
  {
    title: "The Composable App Store",
    body: "Built the ultimate trading dashboard or a seamless payment agent? Share it. Others can copy your exact UI layout and agent workflows with a single click, turning your intent into a tradable, shareable asset.",
    graphic: "store" as const,
  },
] as const;

function FeatureGraphic({
  kind,
}: {
  kind: (typeof FEATURES)[number]["graphic"];
}) {
  if (kind === "customize") {
    return (
      <svg viewBox="0 0 320 180" className="h-auto w-full" aria-hidden>
        <rect
          x="20"
          y="24"
          width="120"
          height="80"
          rx="14"
          fill="rgba(255,255,255,0.04)"
          stroke="hsla(195,100%,50%,0.5)"
        />
        <path
          d="M36 78 C54 60 70 50 92 56 C108 60 120 72 128 66"
          stroke="hsl(195,100%,50%)"
          strokeWidth="2.5"
          fill="none"
        />
        <rect
          x="156"
          y="24"
          width="144"
          height="48"
          rx="12"
          fill="rgba(255,255,255,0.04)"
          stroke="rgba(255,255,255,0.12)"
        />
        <rect x="170" y="38" width="90" height="6" rx="3" fill="rgba(255,255,255,0.25)" />
        <rect x="170" y="50" width="60" height="5" rx="2.5" fill="rgba(255,255,255,0.12)" />
        <rect
          x="156"
          y="84"
          width="68"
          height="56"
          rx="12"
          fill="rgba(255,255,255,0.04)"
          stroke="hsla(193,85%,66%,0.45)"
        />
        <circle
          cx="190"
          cy="112"
          r="16"
          stroke="hsl(193,85%,66%)"
          strokeWidth="4"
          strokeDasharray="70 30"
          fill="none"
        />
        <rect
          x="232"
          y="84"
          width="68"
          height="56"
          rx="12"
          fill="rgba(255,255,255,0.04)"
          stroke="rgba(255,255,255,0.12)"
        />
        <rect x="246" y="100" width="40" height="5" rx="2.5" fill="rgba(255,255,255,0.2)" />
        <rect x="246" y="112" width="28" height="5" rx="2.5" fill="rgba(255,255,255,0.12)" />
        <path
          d="M140 64 H156"
          stroke="hsl(196,100%,83%)"
          strokeWidth="1.5"
          strokeDasharray="3 3"
        />
        <circle cx="148" cy="64" r="3" fill="hsl(196,100%,83%)" />
      </svg>
    );
  }

  if (kind === "automate") {
    return (
      <svg viewBox="0 0 320 180" className="h-auto w-full" aria-hidden>
        <circle
          cx="160"
          cy="88"
          r="36"
          fill="hsla(195,100%,50%,0.12)"
          stroke="hsl(195,100%,50%)"
        />
        <text
          x="160"
          y="94"
          textAnchor="middle"
          fill="white"
          fontSize="14"
          fontFamily="system-ui"
          fontWeight="600"
        >
          Agent
        </text>
        {[
          { x: 56, y: 40, label: "Beefy" },
          { x: 248, y: 40, label: "Aerodrome" },
          { x: 56, y: 132, label: "Events" },
          { x: 248, y: 132, label: "Checkout" },
        ].map((node) => (
          <g key={node.label}>
            <line
              x1="160"
              y1="88"
              x2={node.x + 28}
              y2={node.y + 14}
              stroke="rgba(255,255,255,0.15)"
              strokeDasharray="4 4"
            />
            <rect
              x={node.x}
              y={node.y}
              width="56"
              height="28"
              rx="8"
              fill="rgba(255,255,255,0.05)"
              stroke="rgba(255,255,255,0.15)"
            />
            <text
              x={node.x + 28}
              y={node.y + 18}
              textAnchor="middle"
              fill="rgba(255,255,255,0.7)"
              fontSize="9"
              fontFamily="system-ui"
            >
              {node.label}
            </text>
          </g>
        ))}
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 320 180" className="h-auto w-full" aria-hidden>
      <rect
        x="48"
        y="36"
        width="140"
        height="108"
        rx="16"
        fill="rgba(255,255,255,0.04)"
        stroke="rgba(255,255,255,0.14)"
      />
      <rect x="64" y="54" width="70" height="8" rx="4" fill="rgba(255,255,255,0.25)" />
      <rect x="64" y="72" width="108" height="48" rx="10" fill="hsla(195,100%,50%,0.12)" />
      <path
        d="M188 90 H214"
        stroke="hsl(193,85%,66%)"
        strokeWidth="2"
        markerEnd="url(#arrow)"
      />
      <defs>
        <marker
          id="arrow"
          markerWidth="8"
          markerHeight="8"
          refX="6"
          refY="3"
          orient="auto"
        >
          <path d="M0 0 L6 3 L0 6 Z" fill="hsl(193,85%,66%)" />
        </marker>
      </defs>
      <rect
        x="214"
        y="48"
        width="72"
        height="84"
        rx="14"
        fill="rgba(255,255,255,0.04)"
        stroke="hsla(193,85%,66%,0.5)"
      />
      <rect x="228" y="66" width="44" height="6" rx="3" fill="rgba(255,255,255,0.25)" />
      <rect x="228" y="80" width="36" height="5" rx="2.5" fill="rgba(255,255,255,0.12)" />
      <rect
        x="228"
        y="100"
        width="44"
        height="16"
        rx="8"
        fill="hsl(195,100%,50%)"
      />
      <text
        x="250"
        y="111"
        textAnchor="middle"
        fill="#000"
        fontSize="8"
        fontWeight="700"
        fontFamily="system-ui"
      >
        Copy
      </text>
    </svg>
  );
}

export function AgentEconomySection() {
  return (
    <section
      id="app-store"
      className="scroll-mt-24 border-t border-white/10 bg-[#05080a] px-5 py-20 sm:px-8 sm:py-28"
    >
      <div className="mx-auto max-w-5xl">
        <p className="text-sm font-medium uppercase tracking-[0.18em] text-[hsl(193,85%,66%)]/80">
          Core Features
        </p>
        <h2 className="mt-3 font-(family-name:--font-instrument-serif) text-3xl tracking-tight text-white sm:text-5xl md:text-6xl">
          Build Your Personal Agent Economy
        </h2>

        <div className="mt-14 grid gap-6 md:grid-cols-3">
          {FEATURES.map((feature) => (
            <article
              key={feature.title}
              className="overflow-hidden rounded-3xl border border-white/10 bg-white/[0.03]"
            >
              <div className="border-b border-white/8 bg-linear-to-br from-[hsla(193,85%,66%,0.1)] to-transparent px-2 pt-2">
                <FeatureGraphic kind={feature.graphic} />
              </div>
              <div className="p-5">
                <h3 className="text-lg font-semibold text-white">
                  {feature.title}
                </h3>
                <p className="mt-3 text-sm leading-relaxed text-white/55">
                  {feature.body}
                </p>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
