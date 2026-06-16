"use client";

import { Sparkles } from "lucide-react";
import { useRotatingStatusPhrase } from "@/hooks/useRotatingStatusPhrase";
import type { AgentStatusPhraseCategory } from "@/lib/agent-status-phrases";

type AgentWorkingIndicatorProps = {
  active?: boolean;
  /** Agent phase — drives which phrase pool rotates (defi, researching, etc.). */
  category?: AgentStatusPhraseCategory;
  /** compact = smaller mascot + text for timeline headers */
  size?: "default" | "compact";
  className?: string;
};

function AgentWorkingMascot({ compact = false }: { compact?: boolean }) {
  const box = compact ? "size-8 rounded-xl shadow-[1.5px_1.5px_0_var(--hero-ink)]" : "size-11 rounded-2xl shadow-[2px_2px_0_var(--hero-ink)]";
  const icon = compact ? "size-3.5" : "size-5";
  const orbitA = compact ? "size-1.5" : "size-2";
  const orbitB = compact ? "size-1" : "size-1.5";

  return (
    <div className="relative shrink-0" aria-hidden>
      <span
        className={`hero-bob absolute -left-0.5 top-0 ${orbitA} rounded-full bg-[var(--hero-coral)]`}
      />
      <span
        className={`hero-bob absolute -right-0.5 bottom-0 ${orbitB} rotate-12 rounded-sm bg-[var(--hero-blue)] [animation-delay:0.35s]`}
      />
      <span
        className={`hero-bob absolute -top-1 right-0 ${orbitB} -rotate-6 rounded-full bg-[var(--hero-mint)] [animation-delay:0.7s]`}
      />
      <div
        className={`hero-wiggle relative flex items-center justify-center border-2 border-[var(--hero-ink)] bg-[var(--hero-amber)] ${box}`}
      >
        <Sparkles className={`${icon} text-[var(--hero-ink)]`} strokeWidth={2.5} />
      </div>
    </div>
  );
}

function StatusPhrase({
  phrase,
  compact = false,
}: {
  phrase: string;
  compact?: boolean;
}) {
  return (
    <p
      key={phrase}
      className={`agent-status-phrase min-w-0 font-semibold italic text-[var(--hero-ink)]/70 ${
        compact ? "text-[10px] tracking-[0.04em]" : "text-sm"
      }`}
    >
      {phrase}
    </p>
  );
}

/** Playful mascot + rotating status line while Radiant is working. */
export function AgentWorkingIndicator({
  active = true,
  category = "thinking",
  size = "default",
  className = "",
}: AgentWorkingIndicatorProps) {
  const compact = size === "compact";
  const phrase = useRotatingStatusPhrase(active, category);

  return (
    <div
      className={`flex items-center gap-3 ${compact ? "gap-2 py-0" : "py-1"} ${className}`}
      role="status"
      aria-live="polite"
      aria-label={phrase}
    >
      <AgentWorkingMascot compact={compact} />
      <StatusPhrase phrase={phrase} compact={compact} />
    </div>
  );
}

export { AgentWorkingMascot };
