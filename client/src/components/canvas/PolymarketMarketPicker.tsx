"use client";

import { useEffect, useRef, useState } from "react";
import {
  marketSelectionValues,
  POLYMARKET_CATEGORY_OPTIONS,
  POLYMARKET_SPORTS_LEAGUE_OPTIONS,
  searchPolymarketMarkets,
  type PolymarketDiscoveryCategory,
  type PolymarketDiscoveryMarket,
} from "@/lib/canvas-polymarket-api";
import type { ConfigValue } from "./canvas-nodes";

const CONTROL =
  "rounded-lg border-2 border-[var(--hero-ink)]/20 bg-white px-2 py-1.5 text-xs font-semibold text-[var(--hero-ink)] outline-none focus:border-[var(--hero-ink)]";

type PolymarketMarketPickerProps = {
  value: string;
  outcome: string;
  placeholder?: string;
  onApply: (patch: Record<string, ConfigValue>) => void;
};

export function PolymarketMarketPicker({
  value,
  outcome,
  placeholder,
  onApply,
}: PolymarketMarketPickerProps) {
  const [query, setQuery] = useState(value);
  const [category, setCategory] = useState<PolymarketDiscoveryCategory | "all">("all");
  const [sportsTag, setSportsTag] = useState("");
  const [results, setResults] = useState<PolymarketDiscoveryMarket[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const debounceRef = useRef<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDocClick = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  useEffect(() => {
    if (debounceRef.current) window.clearTimeout(debounceRef.current);

    const trimmed = query.trim();
    const shouldSearch = open && (trimmed.length >= 2 || category !== "all" || sportsTag.length > 0);
    if (!shouldSearch) {
      debounceRef.current = window.setTimeout(() => {
        setResults([]);
        setLoading(false);
      }, 0);
      return () => {
        if (debounceRef.current) window.clearTimeout(debounceRef.current);
      };
    }

    debounceRef.current = window.setTimeout(() => {
      void (async () => {
        setLoading(true);
        setError(null);
        try {
          const data = await searchPolymarketMarkets({
            q: trimmed.length >= 2 ? trimmed : undefined,
            category: category === "all" ? undefined : category,
            tag: sportsTag || undefined,
            limit: 12,
          });
          setResults(data.markets);
        } catch (err) {
          setError(err instanceof Error ? err.message : "Search failed");
          setResults([]);
        } finally {
          setLoading(false);
        }
      })();
    }, 300);

    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
    };
  }, [query, category, sportsTag, open]);

  const selectMarket = (market: PolymarketDiscoveryMarket) => {
    onApply(marketSelectionValues(market, outcome));
    setQuery(market.question);
    setOpen(false);
  };

  return (
    <div ref={containerRef} className="space-y-2">
      <div className="flex flex-wrap gap-1">
        {POLYMARKET_CATEGORY_OPTIONS.map((opt) => {
          const active = category === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              className={`nodrag rounded-full border-2 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide transition-colors ${
                active
                  ? "border-[var(--hero-ink)] bg-[var(--hero-ink)] text-white"
                  : "border-[var(--hero-ink)]/20 bg-white text-[var(--hero-ink)]/60 hover:border-[var(--hero-ink)]/40"
              }`}
              onClick={() => {
                setCategory(opt.value);
                setSportsTag("");
                setOpen(true);
              }}
            >
              {opt.label}
            </button>
          );
        })}
      </div>

      {category === "sports" ? (
        <select
          className={`${CONTROL} w-full`}
          value={sportsTag}
          onChange={(e) => {
            setSportsTag(e.target.value);
            setOpen(true);
          }}
        >
          {POLYMARKET_SPORTS_LEAGUE_OPTIONS.map((opt) => (
            <option key={opt.value || "all"} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      ) : null}

      <input
        type="text"
        className={`${CONTROL} w-full`}
        value={query}
        placeholder={placeholder ?? "Search market…"}
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
      />

      {open && (loading || error || results.length > 0 || query.trim().length >= 2 || category !== "all") ? (
        <div className="max-h-52 overflow-y-auto rounded-lg border-2 border-[var(--hero-ink)]/15 bg-white shadow-md">
          {loading ? (
            <p className="px-3 py-2 text-xs font-semibold text-[var(--hero-ink)]/45">Searching…</p>
          ) : null}
          {error ? (
            <p className="px-3 py-2 text-xs font-semibold text-[var(--hero-coral)]" role="alert">
              {error}
            </p>
          ) : null}
          {!loading && !error && results.length === 0 ? (
            <p className="px-3 py-2 text-xs font-semibold text-[var(--hero-ink)]/45">
              No markets found. Try another query or category.
            </p>
          ) : null}
          {results.map((market) => {
            const outcomePreview =
              market.outcomes.length >= 2
                ? `${market.outcomes[0]} / ${market.outcomes[1]}`
                : market.outcomes.join(" / ") || "—";
            const tagPreview = market.tags.slice(0, 3).join(", ") || market.category || "—";
            return (
              <button
                key={market.id}
                type="button"
                className="nodrag block w-full border-b border-[var(--hero-ink)]/8 px-3 py-2 text-left last:border-b-0 hover:bg-[var(--hero-bg)]"
                onClick={() => selectMarket(market)}
              >
                <p className="text-xs font-bold text-[var(--hero-ink)]">{market.question}</p>
                {market.event_title ? (
                  <p className="mt-0.5 text-[10px] font-semibold text-[var(--hero-ink)]/45">
                    {market.event_title}
                  </p>
                ) : null}
                <p className="mt-1 text-[10px] font-semibold text-[var(--hero-ink)]/45">
                  {tagPreview} · {outcomePreview}
                </p>
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
