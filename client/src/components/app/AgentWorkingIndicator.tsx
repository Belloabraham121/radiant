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

type MascotTheme = {
  bg: string;
  orbitA: string;
  orbitB: string;
  orbitC: string;
  animation: string;
  pulseStyle?: React.CSSProperties;
  icon: React.ReactNode;
};

function SearchIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}

function ZapIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
    </svg>
  );
}

function GlobeIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <circle cx="12" cy="12" r="10" />
      <line x1="2" y1="12" x2="22" y2="12" />
      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
    </svg>
  );
}

function PlugIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M12 22v-5" />
      <path d="M9 8V2" />
      <path d="M15 8V2" />
      <path d="M18 8v5a6 6 0 0 1-6 6 6 6 0 0 1-6-6V8z" />
    </svg>
  );
}

function getMascotTheme(category: AgentStatusPhraseCategory, iconClass: string): MascotTheme {
  switch (category) {
    case "browsing":
      return {
        bg: "bg-[var(--hero-blue)]",
        orbitA: "bg-[var(--hero-violet)]",
        orbitB: "bg-[var(--hero-mint)]",
        orbitC: "bg-[var(--hero-amber)]",
        animation: "hero-radar",
        icon: <GlobeIcon className={`${iconClass} text-white`} />,
      };
    case "calling_api":
      return {
        bg: "bg-[var(--hero-violet)]",
        orbitA: "bg-[var(--hero-blue)]",
        orbitB: "bg-[var(--hero-amber)]",
        orbitC: "bg-[var(--hero-coral)]",
        animation: "hero-pulse-ring hero-wiggle",
        pulseStyle: { "--pulse-color": "rgba(142, 91, 255, 0.4)" } as React.CSSProperties,
        icon: <PlugIcon className={`${iconClass} text-white`} />,
      };
    case "defi":
      return {
        bg: "bg-[var(--hero-mint)]",
        orbitA: "bg-[var(--hero-amber)]",
        orbitB: "bg-[var(--hero-blue)]",
        orbitC: "bg-[var(--hero-coral)]",
        animation: "hero-pulse-ring hero-wiggle",
        pulseStyle: { "--pulse-color": "rgba(0, 196, 120, 0.4)" } as React.CSSProperties,
        icon: <ZapIcon className={`${iconClass} text-[var(--hero-ink)]`} />,
      };
    case "researching":
      return {
        bg: "bg-[var(--hero-amber)]",
        orbitA: "bg-[var(--hero-blue)]",
        orbitB: "bg-[var(--hero-coral)]",
        orbitC: "bg-[var(--hero-mint)]",
        animation: "hero-wiggle",
        icon: <SearchIcon className={`${iconClass} text-[var(--hero-ink)]`} />,
      };
    default:
      return {
        bg: "bg-[var(--hero-amber)]",
        orbitA: "bg-[var(--hero-coral)]",
        orbitB: "bg-[var(--hero-blue)]",
        orbitC: "bg-[var(--hero-mint)]",
        animation: "hero-wiggle",
        icon: <Sparkles className={`${iconClass} text-[var(--hero-ink)]`} strokeWidth={2.5} />,
      };
  }
}

function AgentWorkingMascot({
  compact = false,
  category = "thinking",
}: {
  compact?: boolean;
  category?: AgentStatusPhraseCategory;
}) {
  const box = compact ? "size-8 rounded-xl shadow-[1.5px_1.5px_0_var(--hero-ink)]" : "size-11 rounded-2xl shadow-[2px_2px_0_var(--hero-ink)]";
  const iconClass = compact ? "size-3.5" : "size-5";
  const orbitA = compact ? "size-1.5" : "size-2";
  const orbitB = compact ? "size-1" : "size-1.5";
  const theme = getMascotTheme(category, iconClass);

  return (
    <div className="relative shrink-0" aria-hidden>
      <span
        className={`hero-bob absolute -left-0.5 top-0 ${orbitA} rounded-full ${theme.orbitA}`}
      />
      <span
        className={`hero-bob absolute -right-0.5 bottom-0 ${orbitB} rotate-12 rounded-sm ${theme.orbitB} [animation-delay:0.35s]`}
      />
      <span
        className={`hero-bob absolute -top-1 right-0 ${orbitB} -rotate-6 rounded-full ${theme.orbitC} [animation-delay:0.7s]`}
      />
      <div
        className={`${theme.animation} relative flex items-center justify-center border-2 border-[var(--hero-ink)] ${theme.bg} ${box}`}
        style={theme.pulseStyle}
      >
        {theme.icon}
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
      <AgentWorkingMascot compact={compact} category={category} />
      <StatusPhrase phrase={phrase} compact={compact} />
    </div>
  );
}

export { AgentWorkingMascot };
