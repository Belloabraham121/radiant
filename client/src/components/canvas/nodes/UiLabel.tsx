"use client";

/** UI Label node — bound scalar or formatted string (Phase 3 stub). */
export function UiLabelNode({ text }: { text?: string }) {
  return (
    <p className="rounded-lg border-2 border-[var(--hero-ink)]/15 bg-white px-3 py-2 text-sm font-semibold text-[var(--hero-ink)]">
      {text ?? "—"}
    </p>
  );
}
