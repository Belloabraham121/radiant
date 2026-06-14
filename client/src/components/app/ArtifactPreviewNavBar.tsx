"use client";

import { useEffect, useState } from "react";
import { RotateCw } from "lucide-react";
import {
  normalizePreviewRoute,
  previewRouteLabel,
} from "@/lib/artifact-preview-routes";

export function ArtifactPreviewNavBar({
  path,
  routes,
  onPathChange,
  onRefresh,
  refreshing,
}: {
  path: string;
  routes: string[];
  onPathChange: (path: string) => void;
  onRefresh: () => void;
  refreshing: boolean;
}) {
  const [draft, setDraft] = useState(path === "/" ? "/" : path);

  useEffect(() => {
    setDraft(path === "/" ? "/" : path);
  }, [path]);

  function commitDraft() {
    onPathChange(normalizePreviewRoute(draft));
  }

  return (
    <div
      className="flex shrink-0 items-center gap-2 border-b-2 border-[var(--hero-ink)]/10 bg-white px-3 py-2"
      role="search"
    >
      <form
        className="flex min-w-0 flex-1 items-center gap-2 rounded-full border-2 border-[var(--hero-ink)]/15 bg-[var(--hero-bg)]/40 px-2.5 py-1"
        onSubmit={(event) => {
          event.preventDefault();
          commitDraft();
        }}
      >
        <div
          className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto"
          role="navigation"
          aria-label="Preview routes"
        >
          {routes.map((route) => {
            const active = route === path;
            return (
              <button
                key={route}
                type="button"
                onClick={() => onPathChange(route)}
                className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold transition-colors ${
                  active
                    ? "bg-[var(--hero-ink)] text-[var(--hero-bg)]"
                    : "text-[var(--hero-ink)]/45 hover:bg-[var(--hero-ink)]/5 hover:text-[var(--hero-ink)]"
                }`}
              >
                {previewRouteLabel(route)}
              </button>
            );
          })}
        </div>
        <span className="shrink-0 text-[var(--hero-ink)]/25" aria-hidden>|</span>
        <input
          type="text"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={commitDraft}
          aria-label="Preview path"
          placeholder="/custom-path"
          spellCheck={false}
          className="w-24 min-w-0 shrink-0 bg-transparent text-xs font-semibold text-[var(--hero-ink)] outline-none placeholder:text-[var(--hero-ink)]/30 sm:w-28"
        />
      </form>

      <button
        type="button"
        onClick={onRefresh}
        disabled={refreshing}
        aria-label="Refresh preview"
        className="flex size-8 shrink-0 items-center justify-center rounded-full border-2 border-[var(--hero-ink)]/15 text-[var(--hero-ink)]/55 transition-colors hover:border-[var(--hero-ink)]/30 hover:text-[var(--hero-ink)] disabled:opacity-40"
      >
        <RotateCw className={`size-3.5 ${refreshing ? "animate-spin" : ""}`} strokeWidth={2.5} />
      </button>
    </div>
  );
}
