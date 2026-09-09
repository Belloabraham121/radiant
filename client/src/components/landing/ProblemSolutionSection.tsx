const ROWS = [
  {
    old: {
      title: "Fragmented",
      body: "You open 5 tabs and connect your wallet 5 times to execute one strategy.",
    },
    neu: {
      title: "Unified",
      body: "You type one sentence, and every dApp you need is generated on a single screen.",
    },
  },
  {
    old: {
      title: "Static UIs",
      body: "Pro traders and beginners are forced to use the exact same, inflexible interfaces.",
    },
    neu: {
      title: "Generative UIs",
      body: "The interface adapts to you. It only shows what you need for your specific intent.",
    },
  },
  {
    old: {
      title: "Manual Execution",
      body: "You have to sit at your computer, staring at charts and clicking buttons.",
    },
    neu: {
      title: "Autonomous Orchestration",
      body: "Delegate execution to an AI agent that works for you 24/7.",
    },
  },
] as const;

export function ProblemSolutionSection() {
  return (
    <section
      id="vision"
      className="scroll-mt-20 bg-[#05080a] px-5 py-20 sm:px-8 sm:py-28"
    >
      <div className="mx-auto max-w-5xl">
        <p className="text-sm font-medium uppercase tracking-[0.18em] text-[hsl(193,85%,66%)]/80">
          The Problem vs. The Solution
        </p>
        <h2 className="mt-3 font-(family-name:--font-instrument-serif) text-3xl tracking-tight text-white sm:text-5xl">
          Why We Are Building This
        </h2>

        <div className="mt-12 grid gap-4 md:grid-cols-2">
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 sm:p-8">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-white/40">
              The Old Web3 (Rigid)
            </h3>
            <ul className="mt-6 space-y-6">
              {ROWS.map((row) => (
                <li key={row.old.title}>
                  <p className="text-base font-semibold text-white/85">
                    {row.old.title}
                  </p>
                  <p className="mt-2 text-sm leading-relaxed text-white/50">
                    {row.old.body}
                  </p>
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-2xl border border-[hsl(193,85%,66%)]/25 bg-[hsl(195,100%,50%)]/[0.06] p-6 sm:p-8">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-[hsl(193,85%,66%)]">
              The New Web3 (Agentic)
            </h3>
            <ul className="mt-6 space-y-6">
              {ROWS.map((row) => (
                <li key={row.neu.title}>
                  <p className="text-base font-semibold text-white">
                    {row.neu.title}
                  </p>
                  <p className="mt-2 text-sm leading-relaxed text-white/60">
                    {row.neu.body}
                  </p>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}
