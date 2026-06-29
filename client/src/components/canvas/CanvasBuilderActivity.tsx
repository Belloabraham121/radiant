"use client";

import { useEffect, useRef } from "react";
import { ChevronDown, ChevronUp, Loader2, Sparkles, X } from "lucide-react";
import type { BuilderActivityEntry } from "@/lib/canvas-build";

const KIND_STYLE: Record<
  BuilderActivityEntry["kind"],
  { dot: string; text: string }
> = {
  thinking: {
    dot: "bg-[var(--hero-violet)]",
    text: "text-[var(--hero-ink)]/60 italic",
  },
  status: {
    dot: "bg-[var(--hero-ink)]/30",
    text: "text-[var(--hero-ink)]/70",
  },
  tool: {
    dot: "bg-[var(--hero-blue)]",
    text: "text-[var(--hero-ink)] font-bold",
  },
  node: {
    dot: "bg-[var(--hero-mint)]",
    text: "text-[var(--hero-ink)]/80",
  },
  edge: {
    dot: "bg-[var(--hero-amber)]",
    text: "text-[var(--hero-ink)]/80",
  },
  warning: {
    dot: "bg-[var(--hero-amber)]",
    text: "text-[var(--hero-amber)] font-semibold",
  },
  error: {
    dot: "bg-[var(--hero-coral)]",
    text: "text-[var(--hero-coral)] font-semibold",
  },
  success: {
    dot: "bg-[var(--hero-mint)]",
    text: "text-[var(--hero-ink)]/75",
  },
  complete: {
    dot: "bg-[var(--hero-mint)]",
    text: "text-[var(--hero-ink)] font-bold",
  },
  ack: {
    dot: "bg-[var(--hero-violet)]",
    text: "text-[var(--hero-ink)]/65",
  },
};

export function CanvasBuilderActivity({
  entries,
  building,
  open,
  collapsed,
  onToggleCollapse,
  onDismiss,
  inputColumnClass,
}: {
  entries: BuilderActivityEntry[];
  building: boolean;
  open: boolean;
  collapsed: boolean;
  onToggleCollapse: () => void;
  onDismiss: () => void;
  inputColumnClass: string;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open || collapsed) return;
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [entries, open, collapsed]);

  if (!open && entries.length === 0) return null;

  const visible = open || building;

  return (
    <div
      className={`pointer-events-none w-full overflow-hidden transition-all duration-300 ease-out ${
        visible
          ? "max-h-80 translate-y-0 opacity-100"
          : "pointer-events-none max-h-0 translate-y-4 opacity-0"
      }`}
      aria-live="polite"
      aria-label="Builder activity"
    >
      <div
        className={`${inputColumnClass} pointer-events-auto overflow-hidden rounded-2xl border-2 border-[var(--hero-ink)] bg-white shadow-[3px_3px_0_var(--hero-ink)]`}
      >
        <div className="flex items-center gap-2 border-b-2 border-[var(--hero-ink)]/10 px-4 py-2.5">
          <Sparkles
            className={`size-4 shrink-0 text-[var(--hero-amber)] ${building ? "animate-pulse" : ""}`}
            strokeWidth={2.5}
          />
          <span className="text-xs font-bold uppercase tracking-[0.12em] text-[var(--hero-ink)]/50">
            Builder
          </span>
          {building ? (
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--hero-violet)]">
              <Loader2 className="size-3 animate-spin" strokeWidth={2.5} />
              Working…
            </span>
          ) : entries.some((e) => e.kind === "complete") ? (
            <span className="text-xs font-semibold text-[var(--hero-mint)]">Complete</span>
          ) : entries.some((e) => e.kind === "error") ? (
            <span className="text-xs font-semibold text-[var(--hero-coral)]">Failed</span>
          ) : (
            <span className="text-xs font-semibold text-[var(--hero-ink)]/40">Ready</span>
          )}
          <div className="ml-auto flex items-center gap-1">
            <button
              type="button"
              onClick={onToggleCollapse}
              className="rounded-lg p-1 text-[var(--hero-ink)]/40 transition-colors hover:bg-[var(--hero-ink)]/5 hover:text-[var(--hero-ink)]"
              aria-label={collapsed ? "Expand builder log" : "Collapse builder log"}
            >
              {collapsed ? (
                <ChevronUp className="size-4" strokeWidth={2.5} />
              ) : (
                <ChevronDown className="size-4" strokeWidth={2.5} />
              )}
            </button>
            {!building ? (
              <button
                type="button"
                onClick={onDismiss}
                className="rounded-lg p-1 text-[var(--hero-ink)]/40 transition-colors hover:bg-[var(--hero-ink)]/5 hover:text-[var(--hero-ink)]"
                aria-label="Dismiss builder log"
              >
                <X className="size-4" strokeWidth={2.5} />
              </button>
            ) : null}
          </div>
        </div>

        {!collapsed ? (
          <div
            ref={scrollRef}
            className="max-h-52 overflow-y-auto px-4 py-3"
          >
            {entries.length === 0 && building ? (
              <p className="text-xs font-semibold italic text-[var(--hero-ink)]/45">
                Connecting to Builder agent…
              </p>
            ) : (
              <ol className="space-y-2">
                {entries.map((entry) => {
                  const style = KIND_STYLE[entry.kind];
                  return (
                    <li key={entry.id} className="flex items-start gap-2">
                      <span
                        className={`mt-1.5 size-1.5 shrink-0 rounded-full ${style.dot}`}
                        aria-hidden
                      />
                      <span className={`min-w-0 text-xs leading-relaxed ${style.text}`}>
                        {entry.message}
                      </span>
                    </li>
                  );
                })}
              </ol>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}
