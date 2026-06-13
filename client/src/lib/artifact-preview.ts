import type { ArtifactFile } from "@/lib/artifact-types";

function escapeStyleClose(css: string): string {
  return css.replace(/<\/style/gi, "<\\/style");
}

function pickAppSource(files: ArtifactFile[]): string {
  const byPath = new Map(files.map((file) => [file.path.replace(/^\/+/, ""), file.content]));
  return byPath.get("src/App.tsx") ?? byPath.get("src/App.jsx") ?? "";
}

function collectCss(files: ArtifactFile[]): string {
  return files
    .filter((file) => file.path.endsWith(".css"))
    .map((file) => file.content.replace(/@import\s+["']tailwindcss["'];?/g, ""))
    .join("\n");
}

/** Client-side preview HTML — no E2B. Uses CDN React + Babel in iframe srcdoc. */
export function buildArtifactPreviewSrcdoc(files: ArtifactFile[]): string {
  const appSource = pickAppSource(files);
  const css = escapeStyleClose(collectCss(files));
  const payload = JSON.stringify({ app: appSource });

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>Radiant preview</title>
<script src="https://cdn.tailwindcss.com"></script>
<style>
:root {
  --hero-bg: #f5f0e8;
  --hero-ink: #1a1a1a;
  --hero-amber: #ffb01f;
  --hero-violet: #8e5bff;
  --hero-mint: #00c478;
}
body {
  margin: 0;
  min-height: 100vh;
  background: var(--hero-bg);
  color: var(--hero-ink);
  font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
}
${css}
</style>
</head>
<body>
<div id="root"></div>
<div id="error" hidden style="padding:1rem;color:#ff5d46;font-weight:700;font-size:14px;"></div>
<script src="https://unpkg.com/@babel/standalone@7/babel.min.js"><\/script>
<script src="https://unpkg.com/react@18/umd/react.development.js"><\/script>
<script src="https://unpkg.com/react-dom@18/umd/react-dom.development.js"><\/script>
<script>
(function () {
  const payload = ${payload};
  const errEl = document.getElementById("error");
  function showError(msg) {
    errEl.hidden = false;
    errEl.textContent = msg;
  }
  if (!payload.app) {
    showError("No src/App.tsx found — ask your agent to add one.");
    return;
  }
  function createPreviewRequire() {
    const registry = {
      react: React,
      "react-dom": ReactDOM,
      "react-dom/client": { createRoot: ReactDOM.createRoot.bind(ReactDOM) },
      "react/jsx-runtime": {
        jsx: React.createElement,
        jsxs: React.createElement,
        Fragment: React.Fragment,
      },
    };
    return function previewRequire(name) {
      if (registry[name]) return registry[name];
      throw new Error(
        "Preview cannot load module: " + name + " (chat preview supports React only — avoid lucide and other npm imports)",
      );
    };
  }
  try {
    const transformed = Babel.transform(payload.app, {
      presets: [
        ["env", { modules: "commonjs" }],
        ["react", { runtime: "classic" }],
        "typescript",
      ],
      filename: "App.tsx",
    }).code;
    const module = { exports: {} };
    const exports = module.exports;
    const require = createPreviewRequire();
    const fn = new Function("React", "ReactDOM", "require", "exports", "module", transformed);
    fn(React, ReactDOM, require, exports, module);
    const App = module.exports.default || module.exports;
    if (typeof App !== "function") {
      throw new Error("App.tsx must default-export a React component.");
    }
    ReactDOM.createRoot(document.getElementById("root")).render(React.createElement(App));
  } catch (e) {
    showError(e && e.message ? e.message : String(e));
  }
})();
<\/script>
</body>
</html>`;
}
