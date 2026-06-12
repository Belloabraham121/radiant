import { ShieldCheck } from "lucide-react";
import type { AgentReputation } from "@/lib/explorer-data";

function scoreColor(score: number): string {
  if (score >= 90) return "var(--hero-mint)";
  if (score >= 80) return "var(--hero-blue)";
  if (score >= 70) return "var(--hero-amber)";
  return "var(--hero-coral)";
}

export function ReputationBadge({
  reputation,
  size = "sm",
}: {
  reputation: AgentReputation;
  size?: "sm" | "lg";
}) {
  const color = scoreColor(reputation.score);
  const large = size === "lg";

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border-2 border-[var(--hero-ink)] font-bold ${
        large ? "px-4 py-2 text-sm" : "px-2.5 py-1 text-[11px]"
      }`}
      style={{ backgroundColor: `${color}18`, color }}
      title="ERC-8004 reputation score"
    >
      <ShieldCheck className={large ? "size-4" : "size-3"} strokeWidth={2.5} />
      {reputation.score}
      <span className={large ? "text-[var(--hero-ink)]/45" : "opacity-70"}>/100</span>
    </span>
  );
}

export function ReputationPanel({ reputation }: { reputation: AgentReputation }) {
  const color = scoreColor(reputation.score);

  return (
    <div className="rounded-3xl border-2 border-[var(--hero-ink)] bg-white p-6 shadow-[5px_5px_0_var(--hero-ink)] md:p-8">
      <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-[var(--hero-ink)]/40">
            ERC-8004 reputation
          </p>
          <div className="mt-3 flex flex-wrap items-end gap-4">
            <p
              className="font-heading text-6xl font-extrabold leading-none tracking-tight"
              style={{ color }}
            >
              {reputation.score}
            </p>
            <div className="pb-1">
              <p className="text-sm font-bold text-[var(--hero-ink)]/55">out of 100</p>
              <p className="mt-0.5 text-xs font-medium text-[var(--hero-ink)]/40">
                Onchain feedback &amp; attestations
              </p>
            </div>
          </div>
          <p className="mt-4 max-w-lg text-sm font-medium leading-relaxed text-[var(--hero-ink)]/60">
            Portable trust score from the ERC-8004 identity registry — aggregated from
            human and agent feedback, without locking you into Radiant.
          </p>
          <p className="mt-3 font-mono text-[11px] font-semibold text-[var(--hero-ink)]/35">
            {reputation.registryId}
          </p>
        </div>
        <ReputationBadge reputation={reputation} size="lg" />
      </div>

      <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: "Feedback", value: reputation.feedbackCount.toLocaleString() },
          { label: "Reviewers", value: reputation.uniqueReviewers.toLocaleString() },
          { label: "Positive rate", value: `${reputation.positiveRate}%` },
          { label: "30d attestations", value: reputation.attestations30d.toLocaleString() },
        ].map((item) => (
          <div
            key={item.label}
            className="rounded-2xl border-2 border-dashed border-[var(--hero-ink)]/15 px-4 py-3"
          >
            <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-[var(--hero-ink)]/40">
              {item.label}
            </p>
            <p className="mt-1 font-heading text-xl font-extrabold tracking-tight">
              {item.value}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
