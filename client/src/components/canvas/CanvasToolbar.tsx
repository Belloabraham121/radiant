"use client";

import { Ban, FlaskConical, Hammer, Radio, Settings2 } from "lucide-react";
import type { CanvasMode } from "./canvas-nodes";

const MODES: Array<{ id: CanvasMode; label: string; icon: typeof Hammer }> = [
  { id: "build", label: "Build", icon: Hammer },
  { id: "dry", label: "Dry Run", icon: FlaskConical },
  { id: "live", label: "Live", icon: Radio },
];

export function CanvasToolbar({
  mode,
  onModeChange,
}: {
  mode: CanvasMode;
  onModeChange: (mode: CanvasMode) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 border-b-2 border-[var(--hero-ink)] bg-[var(--hero-bg)] px-4 py-3">
      {/* Mode segmented control */}
      <div className="flex items-center gap-1 rounded-full border-2 border-[var(--hero-ink)] bg-white p-1">
        {MODES.map(({ id, label, icon: Icon }) => {
          const active = mode === id;
          const isLive = id === "live";
          return (
            <button
              key={id}
              type="button"
              onClick={() => onModeChange(id)}
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-bold transition-colors ${
                active
                  ? isLive
                    ? "bg-[var(--hero-mint)] text-[var(--hero-ink)]"
                    : id === "dry"
                      ? "bg-[var(--hero-amber)] text-[var(--hero-ink)]"
                      : "bg-[var(--hero-ink)] text-[var(--hero-bg)]"
                  : "text-[var(--hero-ink)]/55 hover:text-[var(--hero-ink)]"
              }`}
            >
              <Icon className="size-4" strokeWidth={2.5} />
              {label}
              {isLive && active ? (
                <span className="ml-0.5 size-2 animate-pulse rounded-full bg-[var(--hero-ink)]" />
              ) : null}
            </button>
          );
        })}
      </div>

      {/* Right cluster */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          className="inline-flex items-center gap-1.5 rounded-full border-2 border-[var(--hero-ink)] bg-white px-3 py-1.5 text-sm font-bold shadow-[2px_2px_0_var(--hero-ink)] transition-transform hover:-translate-y-0.5"
        >
          <Settings2 className="size-4" strokeWidth={2.5} />
          Policy
        </button>
        <button
          type="button"
          disabled={mode !== "live"}
          className="inline-flex items-center gap-1.5 rounded-full border-2 border-[var(--hero-ink)] bg-[var(--hero-coral)] px-3 py-1.5 text-sm font-bold text-white shadow-[2px_2px_0_var(--hero-ink)] transition-transform hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:translate-y-0"
        >
          <Ban className="size-4" strokeWidth={2.5} />
          Kill
        </button>
      </div>
    </div>
  );
}
