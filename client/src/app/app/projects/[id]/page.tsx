"use client";

import Link from "next/link";
import { notFound, useRouter } from "next/navigation";
import { use, useEffect, useState } from "react";
import { ArrowLeft, ArrowUpRight, Hammer, Loader2, Play, Trash2 } from "lucide-react";
import { SidebarToggle } from "@/components/app/Sidebar";
import { PublishToExplorerPanel } from "@/components/app/PublishToExplorerPanel";
import { DeleteProjectDialog } from "@/components/projects/DeleteProjectDialog";
import { deleteProject, type ProjectSummary } from "@/lib/projects-api";
import { apiFetch } from "@/lib/api";
import { ApiError } from "@/lib/api";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [project, setProject] = useState<ProjectSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [missing, setMissing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;

    void apiFetch<{
      project: {
        id: string;
        session_id: string | null;
        name: string;
        tagline: string;
        template: string;
        status: string;
        accent: string;
        walrus_url: string | null;
        artifact_revision: number;
        updated_at: string;
        created_at: string;
      };
    }>(`/api/v1/projects/${id}`)
      .then((data) => {
        if (cancelled) return;
        const row = data.project;
        setProject({
          id: row.id,
          session_id: row.session_id,
          name: row.name,
          tagline: row.tagline,
          template: row.template,
          status: row.status,
          accent: row.accent,
          walrus_url: row.walrus_url,
          artifact_revision: row.artifact_revision,
          updated_at: row.updated_at,
          created_at: row.created_at,
        });
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

  async function confirmDelete() {
    if (!project) return;

    setDeleting(true);
    setDeleteError(null);
    try {
      await deleteProject(project.id);
      router.push("/app/projects");
    } catch (err) {
      setDeleteError(err instanceof ApiError ? err.message : "Could not delete project");
      setDeleting(false);
    }
  }

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
        This app runs inside Radiant with your agent wallet and platform APIs. Publish it to the
        explorer when you want other Radiant users to install and run it.
      </p>

      <PublishToExplorerPanel projectId={project.id} />

      <DeleteProjectDialog
        project={project}
        open={deleteDialogOpen}
        deleting={deleting}
        error={deleteError}
        onOpenChange={(open) => {
          if (deleting) return;
          setDeleteDialogOpen(open);
          if (!open) setDeleteError(null);
        }}
        onConfirm={() => void confirmDelete()}
      />

      <div className="mt-10 border-t-2 border-dashed border-[var(--hero-ink)]/15 pt-8">
        <h2 className="font-heading text-lg font-extrabold text-red-700">Danger zone</h2>
        <p className="mt-2 max-w-xl text-sm font-medium text-[var(--hero-ink)]/55">
          Permanently delete this project and all saved artifact revisions.
        </p>
        <button
          type="button"
          onClick={() => {
            setDeleteError(null);
            setDeleteDialogOpen(true);
          }}
          disabled={deleting}
          className="mt-4 inline-flex items-center gap-2 rounded-full border-2 border-red-300 bg-red-50 px-5 py-2.5 text-sm font-bold text-red-700 transition-colors hover:border-red-500 disabled:opacity-50"
        >
          <Trash2 className="size-4" strokeWidth={2.5} aria-hidden />
          Delete project
        </button>
      </div>
    </div>
  );
}
