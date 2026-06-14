import type { ArtifactFile } from "@/lib/artifact-types";
import type { Monaco } from "@monaco-editor/react";

export function normalizeArtifactEditorPath(path: string): string {
  return path.replace(/^\/+/, "").replace(/^\/workspace\//, "");
}

export function artifactModelPath(path: string): string {
  return `inmemory://workspace/${normalizeArtifactEditorPath(path)}`;
}

export function languageForArtifactPath(path: string): string {
  const lower = path.toLowerCase();
  if (lower.endsWith(".tsx")) return "typescript";
  if (lower.endsWith(".ts")) return "typescript";
  if (lower.endsWith(".jsx")) return "javascript";
  if (lower.endsWith(".js")) return "javascript";
  if (lower.endsWith(".css")) return "css";
  if (lower.endsWith(".json")) return "json";
  if (lower.endsWith(".html")) return "html";
  if (lower.endsWith(".svg")) return "xml";
  return "plaintext";
}

let extraLibsRegistered = false;
const REACT_EXTRA_LIB = `
declare namespace React {
  type ReactNode = string | number | boolean | null | undefined | ReactElement | ReactNode[];
  interface ReactElement<P = unknown> { type: unknown; props: P; key?: string | null; }
  type FC<P = {}> = (props: P & { children?: ReactNode }) => ReactNode;
  type ElementType = string | FC<unknown>;
  interface ExoticComponent<P = {}> {
    (props: P & { children?: ReactNode }): ReactNode;
  }
  type CSSProperties = Record<string, string | number | undefined>;
}
declare function useState<T>(initial: T): [T, (value: T | ((prev: T) => T)) => void];
declare function useEffect(effect: () => void | (() => void), deps?: unknown[]): void;
declare function useCallback<T extends (...args: unknown[]) => unknown>(fn: T, deps: unknown[]): T;
declare function useMemo<T>(factory: () => T, deps: unknown[]): T;
declare function useRef<T>(initial: T): { current: T };
declare namespace JSX {
  interface IntrinsicElements {
    [elemName: string]: Record<string, unknown>;
  }
  interface Element extends React.ReactElement {}
}
declare const React: {
  createElement: (...args: unknown[]) => React.ReactElement;
  Fragment: unknown;
};
export default React;
export { useState, useEffect, useCallback, useMemo, useRef };
`;

const REACT_DOM_EXTRA_LIB = `
export function createRoot(container: Element | DocumentFragment): {
  render(children: unknown): void;
  unmount(): void;
};
`;

/** Automatic JSX runtime (react-jsx) — satisfies TS module resolution for TSX files. */
const REACT_JSX_RUNTIME_LIB = `
import * as React from "react";
export function jsx(
  type: React.ElementType,
  props: unknown,
  key?: string,
): React.ReactElement;
export function jsxs(
  type: React.ElementType,
  props: unknown,
  key?: string,
): React.ReactElement;
export const Fragment: React.ExoticComponent<{ children?: React.ReactNode }>;
`;

export function configureArtifactMonaco(monaco: Monaco): void {
  const compilerOptions = {
    target: monaco.languages.typescript.ScriptTarget.ES2020,
    allowNonTsExtensions: true,
    allowJs: true,
    checkJs: false,
    moduleResolution: monaco.languages.typescript.ModuleResolutionKind.NodeJs,
    module: monaco.languages.typescript.ModuleKind.ESNext,
    noEmit: true,
    esModuleInterop: true,
    // Classic JSX — React.createElement; matches preview runtime and avoids jsx-runtime requirement.
    jsx: monaco.languages.typescript.JsxEmit.React,
    strict: false,
    skipLibCheck: true,
  };

  monaco.languages.typescript.typescriptDefaults.setCompilerOptions(compilerOptions);
  monaco.languages.typescript.javascriptDefaults.setCompilerOptions(compilerOptions);
  monaco.languages.typescript.typescriptDefaults.setDiagnosticsOptions({
    noSemanticValidation: false,
    noSyntaxValidation: false,
  });

  if (extraLibsRegistered) return;
  extraLibsRegistered = true;

  monaco.languages.typescript.typescriptDefaults.addExtraLib(
    REACT_EXTRA_LIB,
    "file:///node_modules/@types/react/index.d.ts",
  );
  monaco.languages.typescript.typescriptDefaults.addExtraLib(
    REACT_DOM_EXTRA_LIB,
    "file:///node_modules/@types/react-dom/client.d.ts",
  );
  monaco.languages.typescript.typescriptDefaults.addExtraLib(
    REACT_JSX_RUNTIME_LIB,
    "file:///node_modules/react/jsx-runtime.d.ts",
  );
  monaco.languages.typescript.javascriptDefaults.addExtraLib(
    REACT_JSX_RUNTIME_LIB,
    "file:///node_modules/react/jsx-runtime.d.ts",
  );
}

export function syncArtifactModels(monaco: Monaco, files: ArtifactFile[]): void {
  const activePaths = new Set<string>();

  for (const file of files) {
    const normalized = normalizeArtifactEditorPath(file.path);
    if (!normalized) continue;

    activePaths.add(normalized);
    const uri = monaco.Uri.parse(artifactModelPath(file.path));
    const language = languageForArtifactPath(normalized);
    const existing = monaco.editor.getModel(uri);

    if (existing) {
      if (existing.getValue() !== file.content) {
        existing.setValue(file.content);
      }
      if (existing.getLanguageId() !== language) {
        monaco.editor.setModelLanguage(existing, language);
      }
    } else {
      monaco.editor.createModel(file.content, language, uri);
    }
  }

  for (const model of monaco.editor.getModels()) {
    if (model.uri.scheme !== "inmemory" || model.uri.authority !== "workspace") {
      continue;
    }
    const modelPath = model.uri.path.replace(/^\//, "");
    if (!activePaths.has(modelPath)) {
      model.dispose();
    }
  }
}
