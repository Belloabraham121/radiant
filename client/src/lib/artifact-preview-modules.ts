import type { ArtifactFile } from "@/lib/artifact-types";

const SOURCE_EXTENSIONS = [".tsx", ".ts", ".jsx", ".js"];

export function normalizeArtifactPath(path: string): string {
  return path.replace(/^\/+/, "").replace(/^\/workspace\//, "");
}

/** React/TS source files under src/ that the preview bundler can load. */
export function isPreviewModulePath(path: string): boolean {
  const normalized = normalizeArtifactPath(path);
  if (!normalized.startsWith("src/")) return false;
  return SOURCE_EXTENSIONS.some((ext) => normalized.endsWith(ext));
}

export function buildModuleSourceMap(files: ArtifactFile[]): Record<string, string> {
  const map: Record<string, string> = {};
  for (const file of files) {
    const path = normalizeArtifactPath(file.path);
    if (isPreviewModulePath(path)) {
      map[path] = file.content;
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

/** Resolve a relative import from one artifact file to a module id (e.g. src/components/SwapForm.tsx). */
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

  if (!joined.startsWith("src/")) {
    joined = `src/${joined}`;
  }

  const candidates = [
    joined,
    ...SOURCE_EXTENSIONS.map((ext) => `${stripExtension(joined)}${ext}`),
  ];

  for (const candidate of candidates) {
    if (!candidate.startsWith("src/")) continue;
    if (!modules) return `${stripExtension(joined)}.tsx`;
    if (modules[candidate]) return candidate;
  }

  return null;
}

export function pickAppModulePath(files: ArtifactFile[]): string | null {
  const map = buildModuleSourceMap(files);
  if (map["src/App.tsx"]) return "src/App.tsx";
  if (map["src/App.jsx"]) return "src/App.jsx";
  return null;
}
