import {
  NEXT_APP_GLOBALS_CSS,
  NEXT_APP_LAYOUT_TSX,
  RADIANT_CLIENT_TS,
} from "./radiant-client-template.js";

type ArtifactFileInput = { path: string; content: string };

function normalizeClientPath(path: string): string {
  return path.replace(/^\/+/, "").replace(/^\/workspace\//, "");
}

function hasPath(files: ArtifactFileInput[], target: string): boolean {
  return files.some((file) => normalizeClientPath(file.path) === target);
}

function pickPrimaryComponent(files: ArtifactFileInput[]): ArtifactFileInput | null {
  const components = files.filter((file) => {
    const path = normalizeClientPath(file.path);
    return (
      (path.startsWith("components/") || path.startsWith("src/components/")) &&
      path.endsWith(".tsx")
    );
  });
  return components[0] ?? null;
}

function componentImportPath(componentPath: string): string {
  const normalized = normalizeClientPath(componentPath);
  const withoutExt = normalized.replace(/\.tsx$/, "").replace(/\.jsx$/, "");
  if (normalized.startsWith("components/") || normalized.startsWith("src/components/")) {
    return `../${withoutExt}`;
  }
  return `./${withoutExt.replace(/^src\//, "")}`;
}

/**
 * Next.js App Router artifacts need app/page.tsx + lib/radiant-client.ts.
 * Legacy src/App.tsx is still accepted for older previews.
 */
export function ensureAppEntry(files: ArtifactFileInput[]): ArtifactFileInput[] {
  const next: ArtifactFileInput[] = [...files];

  const usesLegacy = hasPath(next, "src/App.tsx") || hasPath(next, "src/App.jsx");
  const usesNext = hasPath(next, "app/page.tsx");

  if (!hasPath(next, "lib/radiant-client.ts")) {
    next.push({ path: "lib/radiant-client.ts", content: RADIANT_CLIENT_TS });
  }

  if (usesNext) {
    if (!hasPath(next, "app/layout.tsx")) {
      next.push({ path: "app/layout.tsx", content: NEXT_APP_LAYOUT_TSX });
    }
    if (!hasPath(next, "app/globals.css")) {
      next.push({ path: "app/globals.css", content: NEXT_APP_GLOBALS_CSS });
    }
    return next;
  }

  if (usesLegacy) {
    return next;
  }

  const primary = pickPrimaryComponent(next);
  const importPath = primary ? componentImportPath(primary.path) : null;

  if (!hasPath(next, "app/layout.tsx")) {
    next.push({ path: "app/layout.tsx", content: NEXT_APP_LAYOUT_TSX });
  }
  if (!hasPath(next, "app/globals.css")) {
    next.push({ path: "app/globals.css", content: NEXT_APP_GLOBALS_CSS });
  }

  if (importPath) {
    next.push({
      path: "app/page.tsx",
      content:
        `"use client";\n\n` +
        `import Main from "${importPath}";\n\n` +
        `export default function Page() {\n` +
        `  return <Main />;\n` +
        `}\n`,
    });
  } else {
    next.push({
      path: "app/page.tsx",
      content:
        `"use client";\n\n` +
        `export default function Page() {\n` +
        `  return (\n` +
        `    <main style={{ padding: 24 }}>\n` +
        `      <p>Add components under components/ and import them from app/page.tsx.</p>\n` +
        `    </main>\n` +
        `  );\n` +
        `}\n`,
    });
  }

  return next;
}
