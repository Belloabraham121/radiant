"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowUpRight, Hammer, Play, Sparkles, Trash2 } from "lucide-react";
import { DeleteProjectDialog } from "@/components/projects/DeleteProjectDialog";
import { deleteProject, type ProjectSummary } from "@/lib/projects-api";
import { ApiError } from "@/lib/api";
import type { YourProjectsScope } from "./projects-hub-types";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function YourProjectsList({
  projects,
  scope,
  search,
  onDeleted,
}: {
  projects: ProjectSummary[];
  scope: YourProjectsScope;
  search: string;
  onDeleted: (projectId: string) => void;
}) {
  const [pendingDelete, setPendingDelete] = useState<ProjectSummary | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  async function confirmDelete() {
    if (!pendingDelete) return;

    setDeleting(true);
    setDeleteError(null);
    try {
      await deleteProject(pendingDelete.id);
      onDeleted(pendingDelete.id);
      setPendingDelete(null);
    } catch (err) {
      setDeleteError(err instanceof ApiError ? err.message : "Could not delete project");
    } finally {
      setDeleting(false);
    }
  }

  function openDeleteDialog(project: ProjectSummary) {
    setDeleteError(null);
    setPendingDelete(project);
  }

  function closeDeleteDialog() {
    if (deleting) return;
    setPendingDelete(null);
    setDeleteError(null);
  }

  if (projects.length === 0) {
    return (
      <p className="rounded-2xl border-2 border-dashed border-[var(--hero-ink)]/15 bg-[var(--hero-bg)]/40 p-6 text-sm font-semibold text-[var(--hero-ink)]/55">
        {search.trim()
          ? "No projects match your search."
          : scope === "deployed"
            ? "No deployed projects yet. Deploy from a project’s detail page when you’re ready."
            : scope === "saved"
              ? "No saved-only projects — everything here is deployed, or you haven’t saved from chat yet."
              : "No projects yet. Build in chat, then click Save to Projects in the artifact panel."}
      </p>
    );
  }

  return (
    <>
      <DeleteProjectDialog
        project={pendingDelete}
        open={pendingDelete != null}
        deleting={deleting}
        error={deleteError}
        onOpenChange={(open) => {
          if (!open) closeDeleteDialog();
        }}
        onConfirm={() => void confirmDelete()}
      />

      <div className="grid gap-6 sm:grid-cols-2">
        {projects.map((project) => {
          const isReady = project.status === "live";
          return (
            <article
              key={project.id}
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
                  {project.walrus_url ? (
                    <span className="rounded-full border-2 border-[var(--hero-ink)] bg-[var(--hero-blue)]/15 px-3 py-1 text-[10px] font-bold uppercase text-[var(--hero-blue)]">
                      deployed
                    </span>
                  ) : null}
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
                <h3 className="font-heading text-xl font-extrabold tracking-tight">{project.name}</h3>
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
                  <button
                    type="button"
                    onClick={() => openDeleteDialog(project)}
                    className="inline-flex items-center gap-1.5 rounded-full border-2 border-red-200 px-3 py-1.5 text-xs font-bold text-red-700 transition-colors hover:border-red-400 hover:bg-red-50"
                  >
                    <Trash2 className="size-3.5" strokeWidth={2.5} aria-hidden />
                    Delete
                  </button>
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </>
  );
}
