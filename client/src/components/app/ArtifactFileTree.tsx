"use client";

import { FileCode } from "lucide-react";
import type { ArtifactFile } from "@/lib/artifact-types";

export function ArtifactFileTree({
  files,
  activePath,
  onSelect,
}: {
  files: ArtifactFile[];
  activePath: string;
  onSelect: (path: string) => void;
}) {
  return (
    <ul className="space-y-1 p-2">
      {files.map((file) => {
        const active = file.path === activePath;
        return (
          <li key={file.path}>
            <button
              type="button"
              onClick={() => onSelect(file.path)}
              className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs font-bold transition-colors ${
                active
                  ? "bg-[var(--hero-violet)]/15 text-[var(--hero-violet)]"
                  : "text-[var(--hero-ink)]/70 hover:bg-[var(--hero-ink)]/5"
              }`}
            >
              <FileCode className="size-3.5 shrink-0" />
              <span className="truncate font-mono">{file.path}</span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
