"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2, Search } from "lucide-react";
import { SidebarToggle } from "@/components/app/Sidebar";
import {
  fetchProjects,
  type ProjectSummary,
  type ProjectsPagination,
} from "@/lib/projects-api";
import { fetchInstallations, type InstallationSummary } from "@/lib/installations-api";
import { ExplorerProjectsList } from "./ExplorerProjectsList";
import { InstalledProjectsList } from "./InstalledProjectsList";
import { ProjectsPaginationBar } from "./ProjectsPaginationBar";
import { YourProjectsList } from "./YourProjectsList";
import {
  PROJECTS_HUB_TABS,
  YOUR_PROJECTS_SCOPES,
  parseProjectsHubTab,
  parseProjectsPage,
  parseYourProjectsScope,
  type ProjectsHubTab,
  type YourProjectsScope,
} from "./projects-hub-types";

const PROJECTS_PAGE_SIZE = 12;

function buildProjectsUrl(
  tab: ProjectsHubTab,
  q: string,
  scope?: YourProjectsScope,
  page?: number,
): string {
  const params = new URLSearchParams();
  if (tab !== "yours") params.set("tab", tab);
  if (q.trim()) params.set("q", q.trim());
  if (tab === "yours" && scope && scope !== "all") params.set("scope", scope);
  if (tab === "yours" && page && page > 1) params.set("page", String(page));
  const suffix = params.size ? `?${params.toString()}` : "";
  return `/app/projects${suffix}`;
}

export function ProjectsHub() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const tab = parseProjectsHubTab(searchParams.get("tab"));
  const scope = parseYourProjectsScope(searchParams.get("scope"));
  const page = parseProjectsPage(searchParams.get("page"));
  const [searchInput, setSearchInput] = useState(() => searchParams.get("q") ?? "");
  const [debouncedSearch, setDebouncedSearch] = useState(() => searchParams.get("q") ?? "");

  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [pagination, setPagination] = useState<ProjectsPagination | null>(null);
  const [installations, setInstallations] = useState<InstallationSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(searchInput), 250);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    const currentQ = searchParams.get("q") ?? "";
    const currentPage = parseProjectsPage(searchParams.get("page"));
    const nextPage =
      debouncedSearch !== currentQ && currentPage > 1 ? 1 : currentPage;
    const nextUrl = buildProjectsUrl(tab, debouncedSearch, scope, nextPage);
    const currentUrl = buildProjectsUrl(
      tab,
      currentQ,
      parseYourProjectsScope(searchParams.get("scope")),
      currentPage,
    );
    if (nextUrl !== currentUrl) {
      router.replace(nextUrl, { scroll: false });
    }
  }, [debouncedSearch, tab, scope, router, searchParams]);

  useEffect(() => {
    if (tab !== "yours") return;

    let cancelled = false;
    setLoading(true);
    setError(null);

    void fetchProjects({
      page,
      limit: PROJECTS_PAGE_SIZE,
      search: debouncedSearch,
      scope,
    })
      .then((result) => {
        if (cancelled) return;
        setProjects(result.projects);
        setPagination(result.pagination ?? null);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load projects");
          setProjects([]);
          setPagination(null);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [tab, page, debouncedSearch, scope]);

  useEffect(() => {
    if (tab !== "installed") return;

    let cancelled = false;
    setLoading(true);
    setError(null);

    void fetchInstallations()
      .then((rows) => {
        if (!cancelled) setInstallations(rows);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load installations");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [tab]);

  const setTab = useCallback(
    (next: ProjectsHubTab) => {
      router.replace(buildProjectsUrl(next, debouncedSearch, next === "yours" ? scope : undefined), {
        scroll: false,
      });
    },
    [router, debouncedSearch, scope],
  );

  const setScope = useCallback(
    (next: YourProjectsScope) => {
      router.replace(buildProjectsUrl("yours", debouncedSearch, next, 1), { scroll: false });
    },
    [router, debouncedSearch],
  );

  const setPage = useCallback(
    (nextPage: number) => {
      router.replace(buildProjectsUrl("yours", debouncedSearch, scope, nextPage), { scroll: false });
    },
    [router, debouncedSearch, scope],
  );

  const handleProjectDeleted = useCallback(
    (projectId: string) => {
      setProjects((current) => current.filter((project) => project.id !== projectId));
      setPagination((current) =>
        current
          ? {
              ...current,
              total: Math.max(0, current.total - 1),
              total_pages: Math.max(1, Math.ceil(Math.max(0, current.total - 1) / current.limit)),
            }
          : null,
      );
    },
    [],
  );

  const activeTabMeta = PROJECTS_HUB_TABS.find((t) => t.id === tab)!;

  return (
    <div className="mx-auto w-full max-w-6xl px-6 py-10 md:px-10">
      <div className="mb-6 flex items-start gap-3">
        <SidebarToggle />
        <div className="min-w-0 flex-1">
          <h1 className="font-heading text-3xl font-extrabold tracking-tight md:text-4xl">
            Projects
          </h1>
          <p className="mt-2 max-w-2xl text-sm font-medium leading-relaxed text-[var(--hero-ink)]/55">
            Your builds, installed apps, and the public explorer — all in one place.
          </p>
        </div>
      </div>

      <label className="relative mb-6 block">
        <Search
          className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-[var(--hero-ink)]/35"
          strokeWidth={2.5}
          aria-hidden
        />
        <input
          type="search"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          placeholder={
            tab === "explorer"
              ? "Search public apps, categories, creators…"
              : tab === "installed"
                ? "Search installed apps…"
                : "Search your projects…"
          }
          className="w-full rounded-2xl border-2 border-[var(--hero-ink)] bg-white py-3.5 pl-12 pr-4 text-sm font-semibold shadow-[4px_4px_0_var(--hero-ink)] placeholder:text-[var(--hero-ink)]/35 focus:outline-none focus:ring-2 focus:ring-[var(--hero-violet)]"
        />
      </label>

      <div className="mb-4 flex flex-wrap gap-2">
        {PROJECTS_HUB_TABS.map(({ id, label }) => {
          const active = tab === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={`rounded-full border-2 border-[var(--hero-ink)] px-4 py-2 text-xs font-bold transition-all ${
                active
                  ? "bg-[var(--hero-ink)] text-[var(--hero-bg)] shadow-[2px_2px_0_var(--hero-violet)]"
                  : "bg-white hover:-translate-y-0.5"
              }`}
            >
              {label}
            </button>
          );
        })}
      </div>

      {tab === "yours" ? (
        <div className="mb-6 flex flex-wrap gap-2">
          {YOUR_PROJECTS_SCOPES.map(({ id, label }) => {
            const active = scope === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => setScope(id)}
                className={`rounded-full border-2 px-3.5 py-1.5 text-[11px] font-bold uppercase tracking-wide transition-all ${
                  active
                    ? "border-[var(--hero-violet)] bg-[var(--hero-violet)]/10 text-[var(--hero-violet)]"
                    : "border-[var(--hero-ink)]/15 text-[var(--hero-ink)]/55 hover:border-[var(--hero-ink)]/30"
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>
      ) : null}

      <p className="mb-8 text-xs font-semibold text-[var(--hero-ink)]/45">{activeTabMeta.description}</p>

      {loading && tab !== "explorer" ? (
        <div className="flex items-center justify-center gap-2 py-16 text-sm font-semibold text-[var(--hero-ink)]/45">
          <Loader2 className="size-4 animate-spin" aria-hidden />
          Loading…
        </div>
      ) : null}

      {error ? (
        <p className="mb-6 rounded-2xl border-2 border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
          {error}
        </p>
      ) : null}

      {!loading && !error && tab === "yours" ? (
        <>
          <YourProjectsList
            projects={projects}
            scope={scope}
            search={debouncedSearch}
            onDeleted={handleProjectDeleted}
          />
          {pagination ? (
            <ProjectsPaginationBar pagination={pagination} onPageChange={setPage} />
          ) : null}
        </>
      ) : null}

      {!loading && !error && tab === "installed" ? (
        <InstalledProjectsList
          rows={installations}
          search={debouncedSearch}
          onBrowseExplorer={() => setTab("explorer")}
        />
      ) : null}

      {tab === "explorer" ? <ExplorerProjectsList search={debouncedSearch} /> : null}
    </div>
  );
}
