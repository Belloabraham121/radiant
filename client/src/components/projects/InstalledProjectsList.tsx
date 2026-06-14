"use client";

import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import type { InstallationSummary } from "@/lib/installations-api";
import { matchesSearch } from "./projects-hub-types";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function InstalledProjectsList({
  rows,
  search,
  onBrowseExplorer,
}: {
  rows: InstallationSummary[];
  search: string;
  onBrowseExplorer: () => void;
}) {
  const filtered = rows.filter(
    (row) =>
      matchesSearch(row.name, search) ||
      matchesSearch(row.tagline, search) ||
      matchesSearch(row.category, search),
  );

  if (filtered.length === 0) {
    return (
      <div className="rounded-3xl border-2 border-dashed border-[var(--hero-ink)]/25 bg-white/60 p-10 text-center">
        <p className="text-sm font-semibold text-[var(--hero-ink)]/55">
          {search.trim()
            ? "No installed apps match your search."
            : "No installed apps yet. Browse the Explorer tab to install community apps."}
        </p>
        {!search.trim() ? (
          <button
            type="button"
            onClick={onBrowseExplorer}
            className="mt-4 inline-flex items-center gap-1 text-sm font-bold text-[var(--hero-violet)]"
          >
            Browse Explorer
            <ArrowUpRight className="size-4" />
          </button>
        ) : null}
      </div>
    );
  }

  return (
    <ul className="grid gap-4">
      {filtered.map((row) => (
        <li
          key={row.id}
          className="rounded-3xl border-2 border-[var(--hero-ink)] bg-white p-5 shadow-[4px_4px_0_var(--hero-ink)]"
        >
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-4">
              <span
                className="flex size-12 shrink-0 items-center justify-center rounded-xl border-2 border-[var(--hero-ink)] font-heading text-lg font-extrabold text-white"
                style={{ backgroundColor: row.accent }}
              >
                {row.name[0]?.toUpperCase() ?? "?"}
              </span>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="font-heading text-xl font-extrabold">{row.name}</h2>
                  {!row.available ? (
                    <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-bold uppercase text-red-700">
                      unavailable
                    </span>
                  ) : null}
                </div>
                <p className="mt-1 text-sm font-medium text-[var(--hero-ink)]/55">
                  {row.tagline || row.category}
                </p>
                <p className="mt-2 text-xs font-bold text-[var(--hero-ink)]/40">
                  Installed {formatDate(row.installed_at)}
                  {row.pinned_revision != null ? ` · rev ${row.pinned_revision}` : ""}
                </p>
              </div>
            </div>
            <Link
              href={`/app/installed/${row.id}/run`}
              className="inline-flex items-center justify-center gap-2 rounded-full border-2 border-[var(--hero-ink)] bg-[var(--hero-ink)] px-5 py-2.5 text-sm font-bold text-[var(--hero-bg)] shadow-[3px_3px_0_var(--hero-violet)] transition-transform hover:-translate-y-0.5"
            >
              Open
              <ArrowUpRight className="size-4" />
            </Link>
          </div>
        </li>
      ))}
    </ul>
  );
}
