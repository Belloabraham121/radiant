"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowUpRight, Loader2, PackageOpen } from "lucide-react";
import { SidebarToggle } from "@/components/app/Sidebar";
import { fetchInstallations, type InstallationSummary } from "@/lib/installations-api";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default function InstalledAppsPage() {
  const [rows, setRows] = useState<InstallationSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetchInstallations()
      .then((installations) => {
        if (!cancelled) setRows(installations);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not load installs");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="mx-auto w-full max-w-4xl px-6 py-10 md:px-10">
      <div className="mb-6 flex items-center gap-3">
        <SidebarToggle />
        <h1 className="font-heading text-2xl font-extrabold tracking-tight">Installed apps</h1>
      </div>

      <p className="mb-8 text-sm font-medium leading-relaxed text-[var(--hero-ink)]/55">
        Apps you installed from the explorer run inside Radiant with your agent wallet.
      </p>

      {loading ? (
        <div className="flex items-center gap-2 text-sm font-semibold text-[var(--hero-ink)]/45">
          <Loader2 className="size-4 animate-spin" aria-hidden />
          Loading…
        </div>
      ) : null}

      {error ? <p className="text-sm font-semibold text-red-700">{error}</p> : null}

      {!loading && !error && rows.length === 0 ? (
        <div className="rounded-3xl border-2 border-dashed border-[var(--hero-ink)]/25 bg-white/60 p-10 text-center">
          <PackageOpen className="mx-auto size-10 text-[var(--hero-ink)]/30" strokeWidth={2} />
          <p className="mt-4 text-sm font-semibold text-[var(--hero-ink)]/55">
            No installed apps yet.
          </p>
          <Link
            href="/explorer"
            className="mt-4 inline-flex items-center gap-1 text-sm font-bold text-[var(--hero-violet)]"
          >
            Browse the explorer
            <ArrowUpRight className="size-4" />
          </Link>
        </div>
      ) : null}

      <ul className="grid gap-4">
        {rows.map((row) => (
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
    </div>
  );
}
