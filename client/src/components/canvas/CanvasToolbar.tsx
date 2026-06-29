"use client";

import { Ban, FlaskConical, Hammer, Radio, Settings2, Sparkles } from "lucide-react";
import type { CanvasLlmModelTier } from "@/lib/canvas-types";
import type { CanvasMode } from "./canvas-nodes";

const MODES: Array<{ id: CanvasMode; label: string; icon: typeof Hammer }> = [
  { id: "build", label: "Build", icon: Hammer },
  { id: "dry", label: "Dry Run", icon: FlaskConical },
  { id: "live", label: "Live", icon: Radio },
];

const MODEL_TIERS: Array<{ id: CanvasLlmModelTier; label: string }> = [
  { id: "lite", label: "Lite" },
  { id: "thinking", label: "Thinking" },
];

export function CanvasToolbar({
  mode,
  onModeChange,
  modelTier,
  onModelTierChange,
  dryRunReady,
}: {
  mode: CanvasMode;
  onModeChange: (mode: CanvasMode) => void;
  modelTier: CanvasLlmModelTier;
  onModelTierChange?: (tier: CanvasLlmModelTier) => void;
  dryRunReady?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3 border-b-2 border-[var(--hero-ink)] bg-[var(--hero-bg)] px-4 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1 rounded-full border-2 border-[var(--hero-ink)] bg-white p-1">
          {MODES.map(({ id, label, icon: Icon }) => {
            const active = mode === id;
            const isLive = id === "live";
            const disabled = id === "dry" && !dryRunReady;
            return (
              <button
                key={id}
                type="button"
                disabled={disabled}
                onClick={() => onModeChange(id)}
                className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
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

        {mode === "build" && onModelTierChange ? (
          <div className="flex items-center gap-1.5 rounded-full border-2 border-[var(--hero-ink)] bg-white px-2 py-1">
            <Sparkles className="size-3.5 text-[var(--hero-amber)]" strokeWidth={2.5} />
            <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--hero-ink)]/45">
              Model
            </span>
            {MODEL_TIERS.map(({ id, label }) => {
              const active = modelTier === id;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => onModelTierChange(id)}
                  className={`rounded-full px-2.5 py-1 text-xs font-bold transition-colors ${
                    active
                      ? "bg-[var(--hero-violet)] text-white"
                      : "text-[var(--hero-ink)]/55 hover:text-[var(--hero-ink)]"
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>
        ) : null}
      </div>

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
