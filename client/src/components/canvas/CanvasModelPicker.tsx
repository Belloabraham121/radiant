"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, Sparkles } from "lucide-react";
import type { CanvasLlmModelTier } from "@/lib/canvas-types";

const MODEL_TIERS: Array<{ id: CanvasLlmModelTier; label: string }> = [
  { id: "lite", label: "Lite" },
  { id: "thinking", label: "Thinking" },
];

export function CanvasModelPicker({
  modelTier,
  onModelTierChange,
  disabled,
  variant = "default",
  agentLabel = "Builder",
}: {
  modelTier: CanvasLlmModelTier;
  onModelTierChange: (tier: CanvasLlmModelTier) => void;
  disabled?: boolean;
  variant?: "default" | "footer";
  agentLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const activeLabel = MODEL_TIERS.find((t) => t.id === modelTier)?.label ?? modelTier;

  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [open]);

  const isFooter = variant === "footer";

  return (
    <div ref={rootRef} className="relative shrink-0">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((prev) => !prev)}
        className={
          isFooter
            ? "inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.15em] text-[var(--hero-ink)]/40 transition-colors hover:text-[var(--hero-ink)]/60 disabled:cursor-not-allowed disabled:opacity-40"
            : "inline-flex items-center gap-1.5 rounded-full border-2 border-[var(--hero-ink)] bg-white px-3 py-2 text-xs font-bold text-[var(--hero-ink)] shadow-[2px_2px_0_var(--hero-ink)] transition-transform hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:translate-y-0"
        }
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <Sparkles
          className={`${isFooter ? "size-3" : "size-3.5"} text-[var(--hero-amber)]`}
          strokeWidth={isFooter ? 3 : 2.5}
        />
        <span>
          {isFooter ? `${agentLabel} · ${activeLabel}` : `Model — ${activeLabel}`}
        </span>
        <ChevronDown
          className={`${isFooter ? "size-3" : "size-3.5"} text-[var(--hero-ink)]/45 transition-transform ${open ? "rotate-180" : ""}`}
          strokeWidth={2.5}
        />
      </button>

      {open ? (
        <ul
          role="listbox"
          aria-label="Model tier"
          className="absolute bottom-full left-0 z-20 mb-2 min-w-full overflow-hidden rounded-xl border-2 border-[var(--hero-ink)] bg-white py-1 shadow-[3px_3px_0_var(--hero-ink)]"
        >
          {MODEL_TIERS.map(({ id, label }) => {
            const active = modelTier === id;
            return (
              <li key={id} role="option" aria-selected={active}>
                <button
                  type="button"
                  onClick={() => {
                    onModelTierChange(id);
                    setOpen(false);
                  }}
                  className={`flex w-full items-center px-3 py-2 text-left text-xs font-bold transition-colors ${
                    active
                      ? "bg-[var(--hero-violet)] text-white"
                      : "text-[var(--hero-ink)] hover:bg-[var(--hero-ink)]/5"
                  }`}
                >
                  {label}
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
