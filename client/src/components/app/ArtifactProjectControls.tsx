"use client";

import { usePrivy } from "@privy-io/react-auth";
import { useCallback, useEffect, useState } from "react";
import { Loader2, RotateCcw } from "lucide-react";
import type { ArtifactPayload } from "@/lib/artifact-types";
import {
  fetchProjectArtifact,
  fetchProjectRevisions,
  fetchSessionProjects,
  restoreProjectRevision,
  type ArtifactRevisionSummary,
  type ProjectSummary,
} from "@/lib/projects-api";

export function ArtifactProjectControls({
  sessionId,
  payload,
  streaming,
  onPayloadChange,
  className = "",
}: {
  sessionId?: string;
  payload: ArtifactPayload;
  streaming?: boolean;
  onPayloadChange: (artifact: ArtifactPayload) => void;
  className?: string;
}) {
  const { ready, authenticated } = usePrivy();
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [revisions, setRevisions] = useState<ArtifactRevisionSummary[]>([]);
  const [headRevision, setHeadRevision] = useState(payload.revision);
  const [loadingProjects, setLoadingProjects] = useState(false);
  const [loadingRevision, setLoadingRevision] = useState(false);
  const [restoring, setRestoring] = useState(false);

  const isPreviewProject = payload.project_id === "preview";
  const viewingHistorical =
    !isPreviewProject && payload.revision < headRevision && payload.revision >= 0;

  const loadProjects = useCallback(async () => {
    if (!sessionId || isPreviewProject || !ready || !authenticated) {
      setProjects([]);
      return;
    }
    setLoadingProjects(true);
    try {
      const list = await fetchSessionProjects(sessionId);
      setProjects(list);
    } catch {
      setProjects([]);
    } finally {
      setLoadingProjects(false);
    }
  }, [authenticated, ready, sessionId, isPreviewProject]);

  const loadRevisions = useCallback(async () => {
    if (isPreviewProject || !ready || !authenticated) {
      setRevisions([]);
      setHeadRevision(payload.revision);
      return;
    }
    try {
      const data = await fetchProjectRevisions(payload.project_id);
      setRevisions(data.revisions);
      setHeadRevision(data.current_revision);
    } catch {
      setRevisions([]);
      setHeadRevision(payload.revision);
    }
  }, [authenticated, isPreviewProject, payload.project_id, payload.revision, ready]);

  useEffect(() => {
    void loadProjects();
  }, [loadProjects]);

  useEffect(() => {
    void loadRevisions();
  }, [loadRevisions, payload.project_id, payload.revision]);

  async function handleProjectChange(projectId: string) {
    if (projectId === payload.project_id || streaming) return;
    setLoadingRevision(true);
    try {
      const artifact = await fetchProjectArtifact(projectId);
      onPayloadChange(artifact);
    } finally {
      setLoadingRevision(false);
    }
  }

  async function handleRevisionChange(revision: number) {
    if (revision === payload.revision || streaming || isPreviewProject) return;
    setLoadingRevision(true);
    try {
      const artifact = await fetchProjectArtifact(payload.project_id, revision);
      onPayloadChange(artifact);
    } finally {
      setLoadingRevision(false);
    }
  }

  async function handleRestore() {
    if (streaming || isPreviewProject || !viewingHistorical) return;
    setRestoring(true);
    try {
      const artifact = await restoreProjectRevision(payload.project_id, payload.revision);
      onPayloadChange(artifact);
      await loadRevisions();
    } finally {
      setRestoring(false);
    }
  }

  if (isPreviewProject) {
    return null;
  }

  return (
    <div className={`flex flex-wrap items-center justify-end gap-2 ${className}`}>
      {sessionId ? (
        <label className="flex min-w-0 items-center gap-1.5">
          <span className="shrink-0 text-[10px] font-bold uppercase tracking-wider text-[var(--hero-ink)]/40">
            App
          </span>
          <select
            value={payload.project_id}
            disabled={loadingProjects || streaming || projects.length === 0}
            onChange={(event) => void handleProjectChange(event.target.value)}
            className="max-w-[10rem] truncate rounded-full border-2 border-[var(--hero-ink)]/15 bg-[var(--hero-bg)]/50 px-2 py-1 text-xs font-semibold text-[var(--hero-ink)] outline-none disabled:opacity-50 sm:max-w-[12rem]"
            aria-label="Select app project"
          >
            {projects.length === 0 ? (
              <option value={payload.project_id}>{payload.name}</option>
            ) : (
              projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))
            )}
          </select>
        </label>
      ) : null}

      <label className="flex min-w-0 items-center gap-1.5">
        <span className="shrink-0 text-[10px] font-bold uppercase tracking-wider text-[var(--hero-ink)]/40">
          Ver
        </span>
        <select
          value={payload.revision}
          disabled={loadingRevision || streaming || revisions.length === 0}
          onChange={(event) => void handleRevisionChange(Number(event.target.value))}
          className="rounded-full border-2 border-[var(--hero-ink)]/15 bg-[var(--hero-bg)]/50 px-2 py-1 text-xs font-semibold text-[var(--hero-ink)] outline-none disabled:opacity-50"
          aria-label="Select artifact version"
        >
          {revisions.length === 0 ? (
            <option value={payload.revision}>v{payload.revision}</option>
          ) : (
            revisions.map((entry) => (
              <option key={entry.revision} value={entry.revision}>
                v{entry.revision}
                {entry.revision === headRevision ? " (current)" : ""}
              </option>
            ))
          )}
        </select>
      </label>

      {loadingRevision || loadingProjects ? (
        <Loader2 className="size-3.5 animate-spin text-[var(--hero-ink)]/40" aria-hidden />
      ) : null}

      {viewingHistorical ? (
        <button
          type="button"
          onClick={() => void handleRestore()}
          disabled={restoring || streaming}
          className="inline-flex items-center gap-1 rounded-full border-2 border-[var(--hero-violet)]/30 bg-[var(--hero-violet)]/10 px-2.5 py-1 text-[10px] font-bold text-[var(--hero-violet)] transition-colors hover:border-[var(--hero-violet)]/50 disabled:opacity-50"
        >
          {restoring ? (
            <Loader2 className="size-3 animate-spin" />
          ) : (
            <RotateCcw className="size-3" strokeWidth={2.5} />
          )}
          Restore v{payload.revision}
        </button>
      ) : null}
    </div>
  );
}
