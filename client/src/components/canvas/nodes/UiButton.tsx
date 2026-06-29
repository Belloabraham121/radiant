"use client";

/** UI Button node — displays bound label/state from upstream data (Phase 3 stub). */
export function UiButtonNode({
  label,
  bound,
}: {
  label?: string;
  bound?: unknown;
}) {
  const displayLabel =
    label ??
    (typeof bound === "object" && bound && "label" in bound
      ? String((bound as { label: unknown }).label)
      : "Button");

  return (
    <button
      type="button"
      className="rounded-full border-2 border-[var(--hero-ink)] bg-[var(--hero-mint)]/30 px-4 py-2 text-xs font-bold shadow-[2px_2px_0_var(--hero-ink)]"
    >
      {displayLabel}
    </button>
  );
}
