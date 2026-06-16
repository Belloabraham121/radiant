import {
  NEXT_APP_GLOBALS_CSS,
  NEXT_APP_LAYOUT_TSX,
  RADIANT_CLIENT_TEMPLATE_VERSION,
  RADIANT_CLIENT_TS,
} from "./radiant-client-template.js";
import {
  AGENT_INDICATOR_TSX,
  AGENT_STYLES_CSS,
  RADIANT_AGENT_RUNTIME_TS,
  RADIANT_AGENT_RUNTIME_VERSION,
} from "./radiant-agent-runtime-template.js";
import { mergeMarginReferenceFiles } from "./margin-app-reference.template.js";
import { normalizeArtifactFileContent } from "./artifact-file-content.js";

export { RADIANT_CLIENT_TEMPLATE_VERSION };

type ArtifactFileInput = { path: string; content: string };

export type EnsureAppEntryOptions = {
  template?: string;
};

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

/** Deploy build uses PostCSS Tailwind — preview uses CDN; keep globals in sync. */
export function ensureTailwindInGlobalsCss(css: string): string {
  if (/@import\s+["']tailwindcss["']/.test(css)) return css;
  return `@import "tailwindcss";\n\n${css.trim()}\n`;
}

/** Append agent highlight / indicator styles when missing from generated globals.css. */
export function ensureAgentStylesInGlobalsCss(css: string): string {
  if (css.includes(".radiant-agent-indicator")) return css;
  return `${css.trim()}\n\n${AGENT_STYLES_CSS}\n`;
}

function normalizeGlobalsCssFiles(files: ArtifactFileInput[]): ArtifactFileInput[] {
  return files.map((file) => {
    if (normalizeClientPath(file.path) !== "app/globals.css") return file;
    return {
      ...file,
      content: ensureAgentStylesInGlobalsCss(ensureTailwindInGlobalsCss(file.content)),
    };
  });
}

function injectPlatformFiles(files: ArtifactFileInput[]): ArtifactFileInput[] {
  const next = files.map((file) => {
    if (normalizeClientPath(file.path) !== "lib/radiant-client.ts") {
      return file;
    }
    if (file.content.includes(`Template v${RADIANT_CLIENT_TEMPLATE_VERSION}`)) {
      return file;
    }
    return { ...file, content: RADIANT_CLIENT_TS };
  });

  if (!hasPath(next, "lib/radiant-client.ts")) {
    next.push({ path: "lib/radiant-client.ts", content: RADIANT_CLIENT_TS });
  }
  if (!hasPath(next, "lib/radiant-agent-runtime.ts")) {
    next.push({ path: "lib/radiant-agent-runtime.ts", content: RADIANT_AGENT_RUNTIME_TS });
  } else {
    for (let index = 0; index < next.length; index += 1) {
      if (normalizeClientPath(next[index]!.path) !== "lib/radiant-agent-runtime.ts") {
        continue;
      }
      if (next[index]!.content.includes(`Template v${RADIANT_AGENT_RUNTIME_VERSION}`)) {
        break;
      }
      next[index] = { ...next[index]!, content: RADIANT_AGENT_RUNTIME_TS };
      break;
    }
  }
  if (!hasPath(next, "components/AgentIndicator.tsx")) {
    next.push({ path: "components/AgentIndicator.tsx", content: AGENT_INDICATOR_TSX });
  }

  return next;
}

function ensureAgentRuntimeImportInPage(content: string): string {
  if (/radiant-agent-runtime/.test(content)) {
    return content;
  }
  const importLine = `import "../lib/radiant-agent-runtime";\n`;
  if (/^["']use client["'];?\s*\n/m.test(content)) {
    return content.replace(/^["']use client["'];?\s*\n/m, (match) => `${match}${importLine}`);
  }
  return `"use client";\n\n${importLine}${content}`;
}

function ensureAgentRuntimeImportInLegacyApp(content: string): string {
  if (/radiant-agent-runtime/.test(content)) {
    return content;
  }
  const importLine = `import "../lib/radiant-agent-runtime";\n`;
  if (/^["']use client["'];?\s*\n/m.test(content)) {
    return content.replace(/^["']use client["'];?\s*\n/m, (match) => `${match}${importLine}`);
  }
  return `${importLine}${content}`;
}

function patchPageEntryFiles(files: ArtifactFileInput[]): ArtifactFileInput[] {
  return files.map((file) => {
    const path = normalizeClientPath(file.path);
    if (path === "app/page.tsx") {
      return { ...file, content: ensureAgentRuntimeImportInPage(file.content) };
    }
    if (path === "src/App.tsx" || path === "src/App.jsx") {
      return { ...file, content: ensureAgentRuntimeImportInLegacyApp(file.content) };
    }
    return file;
  });
}

function defaultGlobalsCss(): string {
  return ensureAgentStylesInGlobalsCss(NEXT_APP_GLOBALS_CSS);
}

/**
 * Next.js App Router artifacts need app/page.tsx + lib/radiant-client.ts.
 * Legacy src/App.tsx is still accepted for older previews.
 */
export function ensureAppEntry(
  files: ArtifactFileInput[],
  options: EnsureAppEntryOptions = {},
): ArtifactFileInput[] {
  let seeded = files;
  if (options.template === "margin") {
    seeded = mergeMarginReferenceFiles(seeded);
  }

  let next = injectPlatformFiles(
    seeded.map((file) => ({
      ...file,
      content: normalizeArtifactFileContent(file.content),
    })),
  );

  const usesLegacy = hasPath(next, "src/App.tsx") || hasPath(next, "src/App.jsx");
  const usesNext = hasPath(next, "app/page.tsx");

  if (usesNext) {
    if (!hasPath(next, "app/layout.tsx")) {
      next.push({ path: "app/layout.tsx", content: NEXT_APP_LAYOUT_TSX });
    }
    if (!hasPath(next, "app/globals.css")) {
      next.push({ path: "app/globals.css", content: defaultGlobalsCss() });
    }
    return normalizeGlobalsCssFiles(patchPageEntryFiles(next));
  }

  if (usesLegacy) {
    return normalizeGlobalsCssFiles(patchPageEntryFiles(next));
  }

  const primary = pickPrimaryComponent(next);
  const importPath = primary ? componentImportPath(primary.path) : null;

  if (!hasPath(next, "app/layout.tsx")) {
    next.push({ path: "app/layout.tsx", content: NEXT_APP_LAYOUT_TSX });
  }
  if (!hasPath(next, "app/globals.css")) {
    next.push({ path: "app/globals.css", content: defaultGlobalsCss() });
  }

  if (importPath) {
    next.push({
      path: "app/page.tsx",
      content:
        `"use client";\n\n` +
        `import "../lib/radiant-agent-runtime";\n` +
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
        `import "../lib/radiant-agent-runtime";\n\n` +
        `export default function Page() {\n` +
        `  return (\n` +
        `    <main style={{ padding: 24 }}>\n` +
        `      <p>Add components under components/ and import them from app/page.tsx.</p>\n` +
        `    </main>\n` +
        `  );\n` +
        `}\n`,
    });
  }

  return normalizeGlobalsCssFiles(patchPageEntryFiles(next));
}
