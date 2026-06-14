import type { ArtifactFile } from "@/lib/artifact-types";

/** Normalize preview paths to a leading-slash form (`/` for root). */
export function normalizePreviewRoute(path: string): string {
  const trimmed = path.trim();
  if (!trimmed || trimmed === "/") return "/";
  const withSlash = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  return withSlash.replace(/\/+/g, "/").replace(/\/$/, "") || "/";
}

function isLikelyRouteSegment(segment: string): boolean {
  if (!segment || segment.length > 48) return false;
  if (segment.includes(" ")) return false;
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/i.test(segment);
}

/**
 * Heuristic route discovery from artifact source — Route paths, links, and common page state.
 */
export function extractArtifactPreviewRoutes(files: ArtifactFile[]): string[] {
  const routes = new Set<string>();
  const sourceFiles = files.filter((file) => /\.(tsx|jsx|ts|js)$/i.test(file.path));

  const pathAttrRe = /(?:path|to|href)\s*=\s*["'](\/[^"'#?]*)["']/g;
  const setPageRe = /set(?:Page|View|Tab|Screen|Route)\s*\(\s*["']([^"']+)["']\s*\)/g;
  const pageStateRe =
    /(?:page|view|tab|screen|route|section)\s*===?\s*["']([^"']+)["']/gi;

  for (const file of sourceFiles) {
    const content = file.content;
    let match: RegExpExecArray | null;

    pathAttrRe.lastIndex = 0;
    while ((match = pathAttrRe.exec(content))) {
      routes.add(normalizePreviewRoute(match[1]));
    }

    setPageRe.lastIndex = 0;
    while ((match = setPageRe.exec(content))) {
      const segment = match[1].replace(/^\//, "");
      if (isLikelyRouteSegment(segment)) {
        routes.add(normalizePreviewRoute(segment));
      }
    }

    pageStateRe.lastIndex = 0;
    while ((match = pageStateRe.exec(content))) {
      const segment = match[1].replace(/^\//, "");
      if (isLikelyRouteSegment(segment)) {
        routes.add(normalizePreviewRoute(segment));
      }
    }
  }

  routes.add("/");
  return [...routes].sort((a, b) => {
    if (a === "/") return -1;
    if (b === "/") return 1;
    return a.localeCompare(b);
  });
}

export function previewRouteLabel(path: string): string {
  return path === "/" ? "/" : path;
}
