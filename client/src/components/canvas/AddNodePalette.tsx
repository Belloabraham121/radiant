"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Search } from "lucide-react";
import { CATEGORY_COLOR } from "./canvas-nodes";
import {
  COMMON_NODE_SLUGS,
  NODE_CATALOG,
  NODE_GROUP_ORDER,
  type NodeCatalogEntry,
} from "./node-catalog";
import { NodeGlyph, isBrandIcon, isImageLogo } from "./node-glyph";

/** Render only while open (parent mounts/unmounts) so state resets each time. */
export function AddNodePalette({
  onClose,
  onAdd,
}: {
  onClose: () => void;
  onAdd: (entry: NodeCatalogEntry) => void;
}) {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [showAll, setShowAll] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const searching = query.trim() !== "";

  // Visible nodes: search → all matches; otherwise the common few until
  // "See more" reveals the full catalog.
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const base = q
      ? NODE_CATALOG.filter(
          (e) =>
            e.title.toLowerCase().includes(q) ||
            e.group.toLowerCase().includes(q) ||
            e.description.toLowerCase().includes(q) ||
            e.slug.includes(q),
        )
      : showAll
        ? NODE_CATALOG
        : NODE_CATALOG.filter((e) => COMMON_NODE_SLUGS.includes(e.slug));
    // Stable order by group then catalog order.
    return base
      .slice()
      .sort((a, b) => NODE_GROUP_ORDER.indexOf(a.group) - NODE_GROUP_ORDER.indexOf(b.group));
  }, [query, showAll]);

  const canSeeMore = !searching && !showAll;

  // Autofocus the search field on mount (no state writes here).
  useEffect(() => {
    const raf = requestAnimationFrame(() => inputRef.current?.focus());
    return () => cancelAnimationFrame(raf);
  }, []);

  // Keep active row in view (DOM scroll only).
  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-row="${active}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [active]);

  const commit = (entry: NodeCatalogEntry | undefined) => {
    if (!entry) return;
    onAdd(entry);
    onClose();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      commit(filtered[active]);
    }
  };

  // Group the filtered results for section headers, preserving flat index.
  let flatIndex = -1;

  return (
    <div className="absolute inset-0 z-30 flex items-start justify-center p-6">
      {/* backdrop */}
      <button
        type="button"
        aria-label="Close node palette"
        onClick={onClose}
        className="absolute inset-0 bg-[var(--hero-ink)]/20"
      />

      <div
        role="dialog"
        aria-label="Add node"
        onKeyDown={onKeyDown}
        className="relative mt-10 flex max-h-[70vh] w-full max-w-lg flex-col overflow-hidden rounded-3xl border-2 border-[var(--hero-ink)] bg-white shadow-2xl"
      >
        {/* Search */}
        <div className="flex items-center gap-2 border-b-2 border-[var(--hero-ink)] px-4 py-3">
          <Search className="size-4 text-[var(--hero-ink)]/40" strokeWidth={2.5} />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(0);
            }}
            placeholder="Search nodes…"
            className="min-w-0 flex-1 bg-transparent text-sm font-semibold placeholder:text-[var(--hero-ink)]/35 focus:outline-none"
          />
          <kbd className="rounded-md border-2 border-[var(--hero-ink)]/15 px-1.5 py-0.5 text-[10px] font-bold text-[var(--hero-ink)]/40">
            esc
          </kbd>
        </div>

        {/* Results */}
        <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto p-2">
          {filtered.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm font-medium text-[var(--hero-ink)]/40">
              No nodes match “{query}”.
            </p>
          ) : (
            NODE_GROUP_ORDER.map((group) => {
              const items = filtered.filter((e) => e.group === group);
              if (items.length === 0) return null;
              return (
                <div key={group} className="mb-1.5">
                  <p className="px-3 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--hero-ink)]/30">
                    {group}
                  </p>
                  {items.map((entry) => {
                    flatIndex += 1;
                    const idx = flatIndex;
                    const brand = isBrandIcon(entry.icon);
                    const fullBleed = isImageLogo(entry.icon);
                    const isActive = idx === active;
                    return (
                      <button
                        key={entry.slug}
                        type="button"
                        data-row={idx}
                        onMouseEnter={() => setActive(idx)}
                        onClick={() => commit(entry)}
                        className={`flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition-colors ${
                          isActive ? "bg-[var(--hero-bg)]" : ""
                        }`}
                      >
                        <span
                          className="flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-lg border-2 border-[var(--hero-ink)]"
                          style={{
                            background: fullBleed
                              ? undefined
                              : brand
                                ? "#ffffff"
                                : CATEGORY_COLOR[entry.category],
                          }}
                        >
                          <NodeGlyph
                            icon={entry.icon}
                            className={
                              fullBleed
                                ? "h-full w-full object-cover"
                                : brand
                                  ? "size-5"
                                  : "size-4 text-white"
                            }
                          />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-1.5">
                            <span className="truncate text-sm font-bold">{entry.title}</span>
                            {entry.comingSoon ? (
                              <span className="shrink-0 rounded-full border border-[var(--hero-ink)]/20 bg-[var(--hero-amber)]/25 px-1.5 text-[9px] font-bold uppercase tracking-wide text-[var(--hero-ink)]/60">
                                soon
                              </span>
                            ) : null}
                          </span>
                          <span className="block truncate text-xs font-medium text-[var(--hero-ink)]/45">
                            {entry.description}
                          </span>
                        </span>
                        {isActive ? (
                          <kbd className="shrink-0 rounded-md border-2 border-[var(--hero-ink)]/15 px-1.5 py-0.5 text-[10px] font-bold text-[var(--hero-ink)]/40">
                            ↵
                          </kbd>
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              );
            })
          )}

          {canSeeMore ? (
            <button
              type="button"
              onClick={() => {
                setShowAll(true);
                setActive(0);
              }}
              className="mt-1 flex w-full items-center justify-center gap-1.5 rounded-xl border-2 border-dashed border-[var(--hero-ink)]/20 px-3 py-2 text-xs font-bold text-[var(--hero-ink)]/55 transition-colors hover:border-[var(--hero-ink)] hover:text-[var(--hero-ink)]"
            >
              <ChevronDown className="size-3.5" strokeWidth={2.5} />
              See all {NODE_CATALOG.length} nodes
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
