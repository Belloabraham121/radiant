/** Bouncing three-dot indicator while the agent is working (no streamed text yet). */
export function AgentThinkingDots({ className = "" }: { className?: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 py-0.5 ${className}`}
      role="status"
      aria-label="Radiant is thinking"
    >
      <span className="size-2 animate-bounce rounded-full bg-[var(--hero-ink)]/60 [animation-delay:0ms]" />
      <span className="size-2 animate-bounce rounded-full bg-[var(--hero-ink)]/60 [animation-delay:150ms]" />
      <span className="size-2 animate-bounce rounded-full bg-[var(--hero-ink)]/60 [animation-delay:300ms]" />
    </span>
  );
}
