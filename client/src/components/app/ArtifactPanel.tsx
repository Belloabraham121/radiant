"use client";

import { useState } from "react";
import { Code2, Eye, Rocket, X, type LucideIcon } from "lucide-react";
import { ArtifactCodeView } from "@/components/app/ArtifactCodeView";
import { ArtifactFileTree } from "@/components/app/ArtifactFileTree";
import { ArtifactPreview } from "@/components/app/ArtifactPreview";
import { ArtifactProjectControls } from "@/components/app/ArtifactProjectControls";
import type { ArtifactPayload } from "@/lib/artifact-types";

type ArtifactTab = "preview" | "code" | "deploy";

const ARTIFACT_TABS: { id: ArtifactTab; label: string; Icon: LucideIcon }[] = [
  { id: "preview", label: "Preview", Icon: Eye },
  { id: "code", label: "Code", Icon: Code2 },
  { id: "deploy", label: "Deploy", Icon: Rocket },
];

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
  const [tab, setTab] = useState<ArtifactTab>("preview");

  return (
    <aside
      className={`flex min-h-0 flex-col border-t border-[var(--hero-ink)]/10 bg-white lg:border-t-0 lg:border-l lg:border-[var(--hero-ink)]/10 ${className}`}
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

      <ArtifactProjectControls
        sessionId={sessionId}
        payload={payload}
        streaming={streaming}
        onPayloadChange={onPayloadChange}
      />

      <div className="flex gap-1 border-b-2 border-[var(--hero-ink)]/10 px-3 py-2">
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

      <div className="min-h-0 flex-1 overflow-hidden">
        {tab === "preview" ? (
          <ArtifactPreview files={payload.files} revision={payload.revision} />
        ) : null}

        {tab === "code" ? (
          <div className="flex h-full min-h-0">
            <div className="w-52 shrink-0 border-r-2 border-[var(--hero-ink)]/10 bg-[var(--hero-bg)]/40 overflow-y-auto">
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

        {tab === "deploy" ? (
          <div className="flex h-full items-center justify-center p-6 text-center">
            <p className="max-w-xs text-sm font-semibold text-[var(--hero-ink)]/55">
              Deploy to Walrus is coming in the next phase. Your draft is saved — you can keep
              editing here until publish ships.
            </p>
          </div>
        ) : null}
      </div>
    </aside>
  );
}
