"use client";

import { useEffect, useState } from "react";
import { Code2, Eye, X, type LucideIcon } from "lucide-react";
import { ArtifactCodeView } from "@/components/app/ArtifactCodeView";
import { ArtifactFileTree } from "@/components/app/ArtifactFileTree";
import { ArtifactPreviewWithApproval } from "@/components/app/ArtifactPreviewWithApproval";
import { ArtifactProjectControls } from "@/components/app/ArtifactProjectControls";
import { ArtifactSaveToProjects } from "@/components/app/ArtifactSaveToProjects";
import { consumeArtifactPreviewTabRequest } from "@/lib/artifact-preview-tab";
import type { ArtifactPayload } from "@/lib/artifact-types";

type ArtifactTab = "preview" | "code";

const ARTIFACT_TABS: { id: ArtifactTab; label: string; Icon: LucideIcon }[] = [
  { id: "preview", label: "Preview", Icon: Eye },
  { id: "code", label: "Code", Icon: Code2 },
];

function tabStorageKey(projectId: string): string {
  return `radiant:artifact-tab:${projectId}`;
}

function readStoredTab(projectId?: string): ArtifactTab {
  if (typeof window === "undefined" || !projectId) return "preview";
  try {
    const stored = sessionStorage.getItem(tabStorageKey(projectId));
    if (stored === "preview" || stored === "code") {
      return stored;
    }
    if (stored === "deploy") return "preview";
  } catch {
    // ignore
  }
  return "preview";
}

export function ArtifactPanel({
  payload,
  activePath,
  streaming = false,
  sessionId,
  onActivePathChange,
  onPayloadChange,
  onClose,
  className = "",
}: {
  payload: ArtifactPayload;
  activePath: string;
  streaming?: boolean;
  sessionId?: string;
  onActivePathChange: (path: string) => void;
  onPayloadChange: (payload: ArtifactPayload) => void;
  onClose: () => void;
  className?: string;
}) {
  const projectId = payload.project_id !== "preview" ? payload.project_id : undefined;
  const [tab, setTab] = useState<ArtifactTab>(() => readStoredTab(projectId));

  useEffect(() => {
    setTab(readStoredTab(projectId));
  }, [projectId]);

  useEffect(() => {
    if (!projectId) return;
    try {
      sessionStorage.setItem(tabStorageKey(projectId), tab);
    } catch {
      // ignore
    }
  }, [projectId, tab]);

  useEffect(() => {
    if (consumeArtifactPreviewTabRequest()) {
      setTab("preview");
    }
  }, [payload.project_id]);

  return (
    <aside
      className={`flex min-h-0 flex-col bg-white lg:border-l lg:border-[var(--hero-ink)]/10 ${className}`}
    >
      <div className="flex items-start justify-between gap-3 border-b-2 border-[var(--hero-ink)]/10 px-4 py-3">
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--hero-violet)]">
            Artifact
          </p>
          <h2 className="truncate font-heading text-base font-extrabold">{payload.name}</h2>
          {payload.tagline ? (
            <p className="truncate text-xs font-medium text-[var(--hero-ink)]/55">
              {payload.tagline}
            </p>
          ) : null}
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close artifact panel"
          className="rounded-lg border-2 border-[var(--hero-ink)]/15 p-1.5 text-[var(--hero-ink)]/50 transition-colors hover:border-[var(--hero-ink)]/30 hover:text-[var(--hero-ink)]"
        >
          <X className="size-4" strokeWidth={2.5} />
        </button>
      </div>

      <div className="flex items-center gap-2 border-b-2 border-[var(--hero-ink)]/10 px-3 py-2">
        <div className="flex shrink-0 gap-1">
          {ARTIFACT_TABS.map(({ id, label, Icon }) => {
            const active = tab === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => setTab(id)}
                aria-label={label}
                title={label}
                className={`relative flex size-8 items-center justify-center rounded-full transition-colors ${
                  active
                    ? "bg-[var(--hero-ink)] text-[var(--hero-bg)]"
                    : "text-[var(--hero-ink)]/50 hover:bg-[var(--hero-ink)]/5 hover:text-[var(--hero-ink)]"
                }`}
              >
                <Icon className="size-4" strokeWidth={2.5} aria-hidden />
                {id === "code" && streaming ? (
                  <span
                    className="absolute -right-0.5 -top-0.5 size-2 rounded-full border-2 border-white bg-[var(--hero-violet)] animate-pulse"
                    aria-hidden
                  />
                ) : null}
              </button>
            );
          })}
        </div>

        <div className="ml-auto flex min-w-0 items-center gap-2">
          <ArtifactProjectControls
            sessionId={sessionId}
            payload={payload}
            streaming={streaming}
            onPayloadChange={onPayloadChange}
            className="min-w-0"
          />
          <ArtifactSaveToProjects
            sessionId={sessionId}
            payload={payload}
            streaming={streaming}
            onSaved={onPayloadChange}
          />
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-hidden">
        {tab === "preview" ? (
          <ArtifactPreviewWithApproval
            files={payload.files}
            revision={payload.revision}
            streaming={streaming}
            projectId={projectId}
            sessionId={sessionId}
          />
        ) : null}

        {tab === "code" ? (
          <div className="flex h-full min-h-0 flex-col lg:flex-row">
            <div className="max-h-[30%] shrink-0 overflow-y-auto border-b-2 border-[var(--hero-ink)]/10 bg-[var(--hero-bg)]/40 lg:max-h-none lg:w-52 lg:border-b-0 lg:border-r-2">
              <ArtifactFileTree
                files={payload.files}
                activePath={activePath}
                onSelect={onActivePathChange}
              />
            </div>
            <ArtifactCodeView
              files={payload.files}
              activePath={activePath}
              streaming={streaming}
            />
          </div>
        ) : null}
      </div>
    </aside>
  );
}
