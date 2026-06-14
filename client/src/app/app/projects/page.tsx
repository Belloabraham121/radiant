"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import { ArrowUpRight, Hammer, Loader2, Play, Sparkles } from "lucide-react";
import { SidebarToggle } from "@/components/app/Sidebar";
import { fetchAllProjects, type ProjectSummary } from "@/lib/projects-api";

gsap.registerPlugin(useGSAP);

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default function ProjectsPage() {
  const ref = useRef<HTMLDivElement>(null);
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    void fetchAllProjects()
      .then((rows) => {
        if (!cancelled) setProjects(rows);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load projects");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useGSAP(
    () => {
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
      if (projects.length === 0) return;
      gsap.from("[data-project-card]", {
        y: 32,
        opacity: 0,
        rotation: () => gsap.utils.random(-2.5, 2.5),
        duration: 0.6,
        stagger: 0.09,
        ease: "back.out(1.4)",
      });
    },
    { scope: ref, dependencies: [projects.length] },
  );

  return (
    <div ref={ref} className="mx-auto w-full max-w-4xl px-6 py-10 md:px-10">
      <div className="mb-6 flex items-start gap-3">
        <SidebarToggle />
        <div>
          <h1 className="font-heading text-3xl font-extrabold tracking-tight md:text-4xl">
            Your projects
          </h1>
          <p className="mt-2 max-w-xl text-sm font-medium leading-relaxed text-[var(--hero-ink)]/55">
            Apps your agent has built for you. Open any project inside Radiant — personal apps stay
            in your dashboard, not on external links.
          </p>
        </div>
      </div>

      {loading ? (
        <div className="mt-16 flex items-center justify-center gap-2 text-sm font-semibold text-[var(--hero-ink)]/45">
          <Loader2 className="size-4 animate-spin" aria-hidden />
          Loading projects…
        </div>
      ) : null}

      {error ? (
        <p className="mt-10 rounded-2xl border-2 border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
          {error}
        </p>
      ) : null}

      {!loading && !error && projects.length === 0 ? (
        <p className="mt-10 rounded-2xl border-2 border-dashed border-[var(--hero-ink)]/15 bg-[var(--hero-bg)]/40 p-6 text-sm font-semibold text-[var(--hero-ink)]/55">
          No projects yet. Ask the agent to build an app in chat — it will appear here when saved.
        </p>
      ) : null}

      <div className="mt-10 grid gap-6 sm:grid-cols-2">
        {projects.map((project) => {
          const isReady = project.status === "live";
          return (
            <article
              key={project.id}
              data-project-card
              className="group flex flex-col gap-4 rounded-3xl border-2 border-[var(--hero-ink)] bg-white p-6 shadow-[5px_5px_0_var(--hero-ink)] transition-all duration-300 hover:-translate-y-2 hover:shadow-[9px_9px_0_var(--hero-ink)]"
            >
              <div className="flex items-start justify-between">
                <span
                  className="flex size-12 items-center justify-center rounded-xl border-2 border-[var(--hero-ink)] font-heading text-xl font-extrabold text-white"
                  style={{ backgroundColor: project.accent }}
                >
                  {project.name[0]?.toUpperCase() ?? "?"}
                </span>
                <span className="flex items-center gap-2">
                  {isReady ? (
                    <span className="flex items-center gap-1.5 rounded-full border-2 border-[var(--hero-ink)] bg-[var(--hero-mint)]/15 px-3 py-1 text-xs font-bold text-[var(--hero-mint)]">
                      <Sparkles className="size-3.5" strokeWidth={2.5} />
                      ready
                    </span>
                  ) : (
                    <span className="flex items-center gap-1.5 rounded-full border-2 border-[var(--hero-ink)] bg-[var(--hero-amber)]/20 px-3 py-1 text-xs font-bold text-[#b97700]">
                      <Hammer className="size-3.5" strokeWidth={2.5} />
                      draft
                    </span>
                  )}
                </span>
              </div>

              <div>
                <h3 className="font-heading text-xl font-extrabold tracking-tight">
                  {project.name}
                </h3>
                <p className="mt-1 text-sm font-medium text-[var(--hero-ink)]/55">
                  {project.tagline || "No tagline"}
                </p>
              </div>

              <div className="flex flex-col gap-3 border-t-2 border-dashed border-[var(--hero-ink)]/15 pt-3">
                <span className="text-xs font-bold text-[var(--hero-ink)]/45">
                  {project.template} · rev {project.artifact_revision} · updated{" "}
                  {formatDate(project.updated_at)}
                </span>
                <div className="flex flex-wrap gap-2">
                  <Link
                    href={`/app/projects/${project.id}/run`}
                    className="inline-flex items-center gap-1.5 rounded-full border-2 border-[var(--hero-ink)] bg-[var(--hero-violet)] px-3 py-1.5 text-xs font-bold text-white"
                  >
                    <Play className="size-3.5" strokeWidth={2.5} aria-hidden />
                    Open
                  </Link>
                  <Link
                    href={`/app/projects/${project.id}`}
                    className="inline-flex items-center gap-1.5 rounded-full border-2 border-[var(--hero-ink)]/20 px-3 py-1.5 text-xs font-bold text-[var(--hero-ink)]/70 hover:border-[var(--hero-ink)]/40"
                  >
                    Details
                    <ArrowUpRight className="size-3.5" strokeWidth={2.5} aria-hidden />
                  </Link>
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
