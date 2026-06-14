"use client";

import Link from "next/link";
import { notFound } from "next/navigation";
import { use, useEffect, useState } from "react";
import { ArrowLeft, ArrowUpRight, Hammer, Loader2, Play } from "lucide-react";
import { SidebarToggle } from "@/components/app/Sidebar";
import { fetchAllProjects, type ProjectSummary } from "@/lib/projects-api";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [project, setProject] = useState<ProjectSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    let cancelled = false;

    void fetchAllProjects()
      .then((rows) => {
        if (cancelled) return;
        const match = rows.find((row) => row.id === id) ?? null;
        if (!match) {
          setMissing(true);
          return;
        }
        setProject(match);
      })
      .catch(() => {
        if (!cancelled) setMissing(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [id]);

  if (loading) {
    return (
      <div className="mx-auto flex w-full max-w-4xl items-center justify-center gap-2 px-6 py-24 text-sm font-semibold text-[var(--hero-ink)]/45">
        <Loader2 className="size-4 animate-spin" aria-hidden />
        Loading project…
      </div>
    );
  }

  if (missing || !project) {
    notFound();
  }

  const isReady = project.status === "live";

  return (
    <div className="mx-auto w-full max-w-4xl px-6 py-10 md:px-10">
      <div className="mb-6 flex items-center gap-3">
        <SidebarToggle />
        <Link
          href="/app/projects"
          className="flex w-fit items-center gap-1.5 text-sm font-bold text-[var(--hero-ink)]/50 transition-colors hover:text-[var(--hero-ink)]"
        >
          <ArrowLeft className="size-4" strokeWidth={2.5} />
          All projects
        </Link>
      </div>

      <div
        className="rounded-3xl border-2 border-[var(--hero-ink)] p-8 shadow-[6px_6px_0_var(--hero-ink)]"
        style={{ backgroundColor: `${project.accent}14` }}
      >
        <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-4">
            <span
              className="flex size-16 shrink-0 items-center justify-center rounded-2xl border-2 border-[var(--hero-ink)] font-heading text-2xl font-extrabold text-white shadow-[3px_3px_0_var(--hero-ink)]"
              style={{ backgroundColor: project.accent }}
            >
              {project.name[0]?.toUpperCase() ?? "?"}
            </span>
            <div>
              <div className="flex flex-wrap items-center gap-3">
                <h1 className="font-heading text-3xl font-extrabold tracking-tight md:text-4xl">
                  {project.name}
                </h1>
                {isReady ? (
                  <span className="rounded-full border-2 border-[var(--hero-ink)] bg-[var(--hero-mint)]/15 px-3 py-1 text-xs font-bold text-[var(--hero-mint)]">
                    ready
                  </span>
                ) : (
                  <span className="flex items-center gap-1.5 rounded-full border-2 border-[var(--hero-ink)] bg-[var(--hero-amber)]/20 px-3 py-1 text-xs font-bold text-[#b97700]">
                    <Hammer className="size-3.5" strokeWidth={2.5} />
                    draft
                  </span>
                )}
              </div>
              <p className="mt-2 max-w-xl text-sm font-medium leading-relaxed text-[var(--hero-ink)]/65">
                {project.tagline || "No tagline yet"}
              </p>
              <p className="mt-3 text-xs font-bold text-[var(--hero-ink)]/45">
                {project.template} · rev {project.artifact_revision} · updated{" "}
                {formatDate(project.updated_at)}
              </p>
            </div>
          </div>

          <Link
            href={`/app/projects/${project.id}/run`}
            className="group inline-flex items-center justify-center gap-2 rounded-full border-2 border-[var(--hero-ink)] bg-[var(--hero-ink)] px-6 py-3.5 text-sm font-bold text-[var(--hero-bg)] shadow-[4px_4px_0_var(--hero-violet)] transition-transform hover:-translate-y-0.5"
          >
            <Play className="size-4" strokeWidth={2.5} aria-hidden />
            Open in Radiant
            <ArrowUpRight className="size-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
          </Link>
        </div>
      </div>

      <p className="mt-6 text-sm font-medium leading-relaxed text-[var(--hero-ink)]/55">
        This app runs inside Radiant with your agent wallet and platform APIs. It is not published
        as an external link — open it here or from chat after your agent builds it.
      </p>
    </div>
  );
}
