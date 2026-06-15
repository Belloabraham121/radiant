import type { ArtifactFile } from "@/lib/artifact-types";
import { normalizeArtifactFileContent } from "@/lib/artifact-file-content";

const SOURCE_EXTENSIONS = [".tsx", ".ts", ".jsx", ".js"];

const MODULE_ROOTS = ["app/", "components/", "lib/", "src/"] as const;

export function normalizeArtifactPath(path: string): string {
  return path.replace(/^\/+/, "").replace(/^\/workspace\//, "");
}

/** React/TS modules the preview bundler can load (Next.js App Router + legacy src/). */
export function isPreviewModulePath(path: string): boolean {
  const normalized = normalizeArtifactPath(path);
  if (!MODULE_ROOTS.some((root) => normalized.startsWith(root))) {
    return false;
  }
  return SOURCE_EXTENSIONS.some((ext) => normalized.endsWith(ext));
}

export function buildModuleSourceMap(files: ArtifactFile[]): Record<string, string> {
  const map: Record<string, string> = {};
  for (const file of files) {
    const path = normalizeArtifactPath(file.path);
    if (isPreviewModulePath(path)) {
      map[path] = normalizeArtifactFileContent(file.content);
    }
  }
  return map;
}

function stripExtension(path: string): string {
  for (const ext of SOURCE_EXTENSIONS) {
    if (path.endsWith(ext)) {
      return path.slice(0, -ext.length);
    }
  }
  return path;
}

function moduleCandidates(joined: string): string[] {
  return [joined, ...SOURCE_EXTENSIONS.map((ext) => `${stripExtension(joined)}${ext}`)];
}

/** Resolve a relative import from one artifact file to a module path key. */
export function resolveRelativeImport(
  fromPath: string,
  request: string,
  modules?: Record<string, string>,
): string | null {
  const from = normalizeArtifactPath(fromPath);
  const baseDir = from.includes("/") ? from.slice(0, from.lastIndexOf("/")) : "";

  let joined: string;
  if (request.startsWith("./")) {
    joined = baseDir ? `${baseDir}/${request.slice(2)}` : request.slice(2);
  } else if (request.startsWith("../")) {
    const parts = baseDir.split("/");
    let rest = request;
    while (rest.startsWith("../")) {
      if (parts.length === 0) return null;
      parts.pop();
      rest = rest.slice(3);
    }
    joined = parts.length > 0 ? `${parts.join("/")}/${rest}` : rest;
  } else if (request.startsWith("/")) {
    joined = request.slice(1);
  } else {
    return null;
  }

  for (const candidate of moduleCandidates(joined)) {
    if (!modules) return candidate;
    if (modules[candidate]) return candidate;
  }

  return null;
}

export function pickAppModulePath(files: ArtifactFile[]): string | null {
  const map = buildModuleSourceMap(files);
  if (map["app/page.tsx"]) return "app/page.tsx";
  if (map["src/app/page.tsx"]) return "src/app/page.tsx";
  if (map["src/App.tsx"]) return "src/App.tsx";
  if (map["src/App.jsx"]) return "src/App.jsx";
  return null;
}
