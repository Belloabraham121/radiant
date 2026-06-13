"use client";

import { useMemo } from "react";
import { buildArtifactPreviewSrcdoc } from "@/lib/artifact-preview";
import type { ArtifactFile } from "@/lib/artifact-types";

export function ArtifactPreview({
  files,
  revision,
}: {
  files: ArtifactFile[];
  revision: number;
}) {
  const srcdoc = useMemo(() => buildArtifactPreviewSrcdoc(files), [files, revision]);

  return (
    <iframe
      title="App preview"
      sandbox="allow-scripts"
      srcDoc={srcdoc}
      className="h-full w-full border-0 bg-[var(--hero-bg)]"
    />
  );
}
