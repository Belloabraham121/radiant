"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import type { ProjectsPagination } from "@/lib/projects-api";

export function ProjectsPaginationBar({
  pagination,
  onPageChange,
}: {
  pagination: ProjectsPagination;
  onPageChange: (page: number) => void;
}) {
  if (pagination.total_pages <= 1) return null;

  const { page, total_pages, total } = pagination;

  return (
    <div className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t-2 border-dashed border-[var(--hero-ink)]/15 pt-6">
      <p className="text-xs font-bold text-[var(--hero-ink)]/45">
        Page {page} of {total_pages} · {total} project{total === 1 ? "" : "s"}
      </p>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
          className="inline-flex items-center gap-1 rounded-full border-2 border-[var(--hero-ink)] px-3 py-1.5 text-xs font-bold disabled:opacity-40"
        >
          <ChevronLeft className="size-4" />
          Previous
        </button>
        <button
          type="button"
          onClick={() => onPageChange(page + 1)}
          disabled={page >= total_pages}
          className="inline-flex items-center gap-1 rounded-full border-2 border-[var(--hero-ink)] px-3 py-1.5 text-xs font-bold disabled:opacity-40"
        >
          Next
          <ChevronRight className="size-4" />
        </button>
      </div>
    </div>
  );
}
