"use client";

import { useState } from "react";
import Link from "next/link";
import { FolderPlus, Loader2 } from "lucide-react";
import type { ArtifactPayload } from "@/lib/artifact-types";
import { saveSessionDraftToProject } from "@/lib/projects-api";
import { ApiError } from "@/lib/api";

export function ArtifactSaveToProjects({
  sessionId,
  payload,
  streaming,
  onSaved,
}: {
  sessionId?: string;
  payload: ArtifactPayload;
  streaming?: boolean;
  onSaved: (artifact: ArtifactPayload) => void;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedProjectId, setSavedProjectId] = useState<string | null>(null);

  if (payload.project_id !== "preview") {
    return null;
  }

  async function handleSave() {
    if (!sessionId || streaming) return;
    setSaving(true);
    setError(null);
    try {
      const result = await saveSessionDraftToProject(sessionId);
      setSavedProjectId(result.artifact.project_id);
      onSaved(result.artifact);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save to Projects");
    } finally {
      setSaving(false);
    }
  }

  if (savedProjectId) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--hero-mint)]">
          Saved
        </span>
        <Link
          href={`/app/projects/${savedProjectId}/run`}
          className="text-xs font-bold text-[var(--hero-violet)] hover:underline"
        >
          Open in Radiant
        </Link>
        <Link
          href="/app/projects"
          className="text-xs font-bold text-[var(--hero-ink)]/50 hover:underline"
        >
          All projects
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={() => void handleSave()}
        disabled={!sessionId || saving || streaming}
        className="inline-flex items-center gap-1.5 rounded-full border-2 border-[var(--hero-ink)] bg-[var(--hero-violet)]/10 px-3 py-1.5 text-[10px] font-bold text-[var(--hero-violet)] transition-transform hover:-translate-y-0.5 disabled:opacity-50"
      >
        {saving ? (
          <Loader2 className="size-3 animate-spin" aria-hidden />
        ) : (
          <FolderPlus className="size-3.5" strokeWidth={2.5} aria-hidden />
        )}
        Save to Projects
      </button>
      {error ? <p className="max-w-[12rem] text-right text-[10px] font-semibold text-red-700">{error}</p> : null}
    </div>
  );
}
