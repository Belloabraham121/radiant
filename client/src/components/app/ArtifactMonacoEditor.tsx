"use client";

import { useEffect } from "react";
import Editor, { useMonaco } from "@monaco-editor/react";
import type { ArtifactFile } from "@/lib/artifact-types";
import {
  artifactModelPath,
  configureArtifactMonaco,
  languageForArtifactPath,
  normalizeArtifactEditorPath,
  syncArtifactModels,
} from "@/lib/artifact-monaco";

export function ArtifactMonacoEditor({
  files,
  activePath,
}: {
  files: ArtifactFile[];
  activePath: string;
}) {
  const monaco = useMonaco();
  const file = files.find((entry) => entry.path === activePath) ?? files[0];

  useEffect(() => {
    if (!monaco) return;
    configureArtifactMonaco(monaco);
    syncArtifactModels(monaco, files);
  }, [monaco, files]);

  if (!file) {
    return null;
  }

  const normalized = normalizeArtifactEditorPath(activePath || file.path);
  const modelPath = artifactModelPath(activePath || file.path);

  return (
    <Editor
      path={modelPath}
      defaultLanguage={languageForArtifactPath(normalized)}
      theme="artifact-light"
      loading={
        <p className="p-4 text-xs font-semibold text-[var(--hero-ink)]/45">
          Loading editor…
        </p>
      }
      beforeMount={(monacoInstance) => {
        configureArtifactMonaco(monacoInstance);
        monacoInstance.editor.defineTheme("artifact-light", {
          base: "vs",
          inherit: true,
          rules: [],
          colors: {
            "editor.background": "#f5f0e8",
          },
        });
      }}
      onMount={(_editor, monacoInstance) => {
        configureArtifactMonaco(monacoInstance);
        syncArtifactModels(monacoInstance, files);
      }}
      options={{
        readOnly: true,
        minimap: { enabled: false },
        fontSize: 13,
        lineNumbers: "on",
        scrollBeyondLastLine: false,
        automaticLayout: true,
        padding: { top: 12, bottom: 12 },
        wordWrap: "on",
        renderValidationDecorations: "on",
        overviewRulerLanes: 0,
        hideCursorInOverviewRuler: true,
        scrollbar: {
          verticalScrollbarSize: 8,
          horizontalScrollbarSize: 8,
        },
      }}
    />
  );
}
