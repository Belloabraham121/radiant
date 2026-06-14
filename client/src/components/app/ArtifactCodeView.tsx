"use client";

import dynamic from "next/dynamic";
import type { ArtifactFile } from "@/lib/artifact-types";

const ArtifactMonacoEditor = dynamic(
  () =>
    import("@/components/app/ArtifactMonacoEditor").then((mod) => mod.ArtifactMonacoEditor),
  {
    ssr: false,
    loading: () => (
      <p className="p-4 text-xs font-semibold text-[var(--hero-ink)]/45">Loading editor…</p>
    ),
  },
);

export function ArtifactCodeView({
  files,
  activePath,
  streaming = false,
}: {
  files: ArtifactFile[];
  activePath: string;
  streaming?: boolean;
}) {
  const file = files.find((entry) => entry.path === activePath) ?? files[0];

  if (!file) {
    return (
      <p className="p-4 text-sm font-semibold text-[var(--hero-ink)]/50">
        No source files in this artifact yet.
      </p>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="border-b-2 border-[var(--hero-ink)]/10 px-3 py-2 text-xs font-bold text-[var(--hero-ink)]/50">
        {file.path}
        {streaming ? (
          <span className="ml-2 font-semibold normal-case text-[var(--hero-violet)]">
            Agent is editing…
          </span>
        ) : (
          <span className="ml-2 font-semibold normal-case text-[var(--hero-ink)]/35">
            read-only — TypeScript hints enabled · edit via chat
          </span>
        )}
      </div>
      <div className="min-h-0 flex-1">
        <ArtifactMonacoEditor files={files} activePath={activePath} streaming={streaming} />
      </div>
    </div>
  );
}
