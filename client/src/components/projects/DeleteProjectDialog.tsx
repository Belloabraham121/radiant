"use client";

import { Loader2, Trash2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export type DeleteProjectTarget = {
  id: string;
  name: string;
  accent: string;
  tagline?: string;
  walrus_url?: string | null;
};

export function DeleteProjectDialog({
  project,
  open,
  deleting = false,
  error = null,
  onOpenChange,
  onConfirm,
}: {
  project: DeleteProjectTarget | null;
  open: boolean;
  deleting?: boolean;
  error?: string | null;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}) {
  if (!project) return null;

  const accentShadow = project.accent;

  return (
    <Dialog open={open} onOpenChange={(next) => !deleting && onOpenChange(next)}>
      <DialogContent
        showCloseButton={!deleting}
        className="gap-0 overflow-hidden border-2 border-[var(--hero-ink)] bg-white p-0 shadow-[8px_8px_0_var(--hero-ink)] sm:max-w-md"
        style={{ boxShadow: `8px 8px 0 ${accentShadow}` }}
      >
        <div
          className="border-b-2 border-[var(--hero-ink)]/10 px-6 py-5"
          style={{ backgroundColor: `${project.accent}18` }}
        >
          <DialogHeader className="gap-3 text-left">
            <div className="flex items-start gap-4">
              <span
                className="flex size-14 shrink-0 items-center justify-center rounded-2xl border-2 border-[var(--hero-ink)] font-heading text-2xl font-extrabold text-white shadow-[3px_3px_0_var(--hero-ink)]"
                style={{ backgroundColor: project.accent }}
              >
                {project.name[0]?.toUpperCase() ?? "?"}
              </span>
              <div className="min-w-0 pt-1">
                <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--hero-ink)]/45">
                  Delete project
                </p>
                <DialogTitle className="font-heading text-xl font-extrabold tracking-tight text-[var(--hero-ink)]">
                  Delete {project.name}?
                </DialogTitle>
                {project.tagline ? (
                  <p className="mt-1 truncate text-sm font-medium text-[var(--hero-ink)]/55">
                    {project.tagline}
                  </p>
                ) : null}
              </div>
            </div>
            <DialogDescription className="text-sm font-medium leading-relaxed text-[var(--hero-ink)]/65">
              This permanently removes the project, all saved artifact revisions, and cannot be
              undone.
              {project.walrus_url ? (
                <span className="mt-2 block font-semibold text-[var(--hero-ink)]/80">
                  This project is deployed — deleting it removes your live deployment too.
                </span>
              ) : null}
            </DialogDescription>
          </DialogHeader>
        </div>

        <div className="px-6 py-5">
          {error ? (
            <p className="mb-4 rounded-xl border-2 border-red-200 bg-red-50 px-4 py-2.5 text-sm font-semibold text-red-700">
              {error}
            </p>
          ) : null}

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              disabled={deleting}
              className="inline-flex items-center justify-center rounded-full border-2 border-[var(--hero-ink)]/20 bg-white px-5 py-2.5 text-sm font-bold text-[var(--hero-ink)]/70 transition-colors hover:border-[var(--hero-ink)]/40 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={onConfirm}
              disabled={deleting}
              className="inline-flex items-center justify-center gap-2 rounded-full border-2 border-[var(--hero-ink)] px-5 py-2.5 text-sm font-bold text-white transition-transform hover:-translate-y-0.5 disabled:opacity-60"
              style={{
                backgroundColor: project.accent,
                boxShadow: `4px 4px 0 var(--hero-ink)`,
              }}
            >
              {deleting ? (
                <Loader2 className="size-4 animate-spin" aria-hidden />
              ) : (
                <Trash2 className="size-4" strokeWidth={2.5} aria-hidden />
              )}
              Delete project
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
