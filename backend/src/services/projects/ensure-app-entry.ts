type ArtifactFileInput = { path: string; content: string };

function normalizeClientPath(path: string): string {
  return path.replace(/^\/+/, "").replace(/^\/workspace\//, "");
}

function hasAppEntry(files: ArtifactFileInput[]): boolean {
  return files.some(
    (file) =>
      normalizeClientPath(file.path) === "src/App.tsx" ||
      normalizeClientPath(file.path) === "src/App.jsx",
  );
}

function pickPrimaryComponent(files: ArtifactFileInput[]): ArtifactFileInput | null {
  const components = files.filter((file) => {
    const path = normalizeClientPath(file.path);
    return path.startsWith("src/components/") && path.endsWith(".tsx");
  });
  return components[0] ?? null;
}

function importPathFromSrc(componentPath: string): string {
  const normalized = normalizeClientPath(componentPath).replace(/^src\//, "");
  return `./${normalized.replace(/\.tsx$/, "")}`;
}

/**
 * Preview and deploy expect src/App.tsx as the entry. If the agent only wrote components,
 * synthesize a thin App that mounts the first component — not a product template.
 */
export function ensureAppEntry(files: ArtifactFileInput[]): ArtifactFileInput[] {
  if (hasAppEntry(files)) {
    return files;
  }

  const primary = pickPrimaryComponent(files);
  if (primary) {
    const importPath = importPathFromSrc(primary.path);
    return [
      ...files,
      {
        path: "src/App.tsx",
        content: `import Main from "${importPath}";\n\nexport default function App() {\n  return <Main />;\n}\n`,
      },
    ];
  }

  return [
    ...files,
    {
      path: "src/App.tsx",
      content:
        "export default function App() {\n" +
        "  return (\n" +
        "    <main style={{ padding: 24, fontFamily: 'system-ui' }}>\n" +
        "      <p>Add components under src/components/ and import them from src/App.tsx.</p>\n" +
        "    </main>\n" +
        "  );\n" +
        "}\n",
    },
  ];
}
