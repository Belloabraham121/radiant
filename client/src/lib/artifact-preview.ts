import type { ArtifactFile } from "@/lib/artifact-types";
import {
  PREVIEW_API_REQUEST,
  PREVIEW_API_RESPONSE,
  PREVIEW_MESSAGE_TYPE,
  PREVIEW_NAVIGATE_TYPE,
  RADIANT_AGENT_EVENT_TYPE,
} from "@/lib/artifact-preview-bridge";
import {
  buildModuleSourceMap,
  normalizeArtifactPath,
  pickAppModulePath,
} from "@/lib/artifact-preview-modules";

function escapeStyleClose(css: string): string {
  return css.replace(/<\/style/gi, "<\\/style");
}

function collectCss(files: ArtifactFile[]): string {
  return files
    .filter((file) => file.path.endsWith(".css"))
    .map((file) => file.content.replace(/@import\s+["']tailwindcss["'];?/g, ""))
    .join("\n");
}

/** Remove CSS imports — styles are injected into the preview <style> block from artifact files. */
function stripCssImports(source: string): string {
  return source
    .replace(/^\s*import\s+(?:type\s+)?(?:[\w*{}\s,]+\s+from\s+)?["'][^"']*\.css["']\s*;?\s*$/gm, "")
    .replace(/import\s+(?:type\s+)?(?:[\w*{}\s,]+\s+from\s+)?["'][^"']*\.css["']\s*;?/g, "");
}

/**
 * Chat preview runs in a browser iframe (not E2B/mock). Strip imports the runtime cannot resolve.
 */
export function prepareAppSourceForPreview(source: string): string {
  return stripCssImports(source).replace(/^["']use client["'];?\s*\n?/m, "");
}

export type ArtifactPreviewOptions = {
  projectId?: string;
  installationId?: string;
  sessionId?: string;
};

function prepareModuleMap(
  files: ArtifactFile[],
  options: ArtifactPreviewOptions = {},
): Record<string, string> {
  const raw = buildModuleSourceMap(files);
  const prepared: Record<string, string> = {};
  for (const [path, source] of Object.entries(raw)) {
    let next = prepareAppSourceForPreview(source);
    if (path === "lib/radiant-client.ts") {
      next = patchRadiantClientForPreview(next);
    }
    prepared[path] = next;
  }
  return prepared;
}

/** Patch platform client for chat preview iframe (no Node process, session-scoped APIs). */
export function patchRadiantClientForPreview(source: string): string {
  let next = source;

  if (next.includes("process.env") && !next.includes("function readPublicEnv")) {
    next = next.replace(
      "declare global {",
      `function readPublicEnv(key: string): string {
  try {
    if (typeof process !== "undefined" && process.env && typeof process.env[key] === "string") {
      return process.env[key] as string;
    }
  } catch {
    // Preview iframe has no Node process global.
  }
  return "";
}

declare global {`,
    );
    next = next.replace(
      /return process\.env\.([A-Z0-9_]+)\s*\?\?\s*"";/g,
      'return readPublicEnv("$1");',
    );
  }

  if (!next.includes("__RADIANT_SESSION_ID__")) {
    next = patchRadiantClientForSessionPreview(next);
  }

  return next;
}

/** Legacy v4 client in chat drafts — patch session API paths without an async template fetch. */
export function patchRadiantClientForSessionPreview(source: string): string {
  if (source.includes("__RADIANT_SESSION_ID__")) {
    return source;
  }

  let next = source.replace(
    "__RADIANT_INSTALLATION_ID__?: string;",
    "__RADIANT_INSTALLATION_ID__?: string;\n    __RADIANT_SESSION_ID__?: string;",
  );

  if (!next.includes("function sessionId()")) {
    next = next.replace(
      `function installationId(): string {
  if (typeof window !== "undefined" && window.__RADIANT_INSTALLATION_ID__) {
    return window.__RADIANT_INSTALLATION_ID__;
  }
  return process.env.NEXT_PUBLIC_RADIANT_INSTALLATION_ID ?? "";
}

function scopeIds(): { projectId: string; installationId: string | null } {`,
      `function installationId(): string {
  if (typeof window !== "undefined" && window.__RADIANT_INSTALLATION_ID__) {
    return window.__RADIANT_INSTALLATION_ID__;
  }
  return process.env.NEXT_PUBLIC_RADIANT_INSTALLATION_ID ?? "";
}

function sessionId(): string {
  if (typeof window !== "undefined" && window.__RADIANT_SESSION_ID__) {
    return window.__RADIANT_SESSION_ID__;
  }
  return process.env.NEXT_PUBLIC_RADIANT_SESSION_ID ?? "";
}

function scopeIds(): {
  projectId: string;
  installationId: string | null;
  sessionId: string;
} {`,
    );
  }

  if (!next.includes("const session = sessionId()")) {
    next = next.replace(
      `  const install = installationId();
  const project = projectId();`,
      `  const install = installationId();
  const project = projectId();
  const session = sessionId();`,
    );
  }

  next = next.replace(
    `    return { projectId: project, installationId: install };`,
    `    return { projectId: project, installationId: install, sessionId: session };`,
  );

  next = next.replace(
    `  if (!project) {
    throw new Error("Missing Radiant project id");
  }
  return { projectId: project, installationId: null };`,
    `  if (project) {
    return { projectId: project, installationId: null, sessionId: session };
  }
  if (session) {
    return { projectId: "", installationId: null, sessionId: session };
  }
  throw new Error("Missing Radiant project or session id");`,
  );

  next = next.replace(
    `function projectApiPrefix(): string {
  const { projectId: id } = scopeIds();
  return "/api/v1/projects/" + id;
}`,
    `function projectApiPrefix(): string {
  const { projectId: id, sessionId: sid } = scopeIds();
  if (sid && !id) {
    return "/api/v1/chat/sessions/" + sid;
  }
  return "/api/v1/projects/" + id;
}`,
  );

  next = next.replace(
    `function actionApiPath(action: string): string {
  const { projectId: id, installationId: install } = scopeIds();
  if (install) {
    return "/api/v1/installations/" + install + "/actions/" + action;
  }
  return "/api/v1/projects/" + id + "/actions/" + action;
}`,
    `function actionApiPath(action: string): string {
  const { projectId: id, installationId: install, sessionId: sid } = scopeIds();
  if (install) {
    return "/api/v1/installations/" + install + "/actions/" + action;
  }
  if (sid && !id) {
    return "/api/v1/chat/sessions/" + sid + "/actions/" + action;
  }
  return "/api/v1/projects/" + id + "/actions/" + action;
}`,
  );

  return next;
}

/** Client-side preview HTML — no E2B. Uses CDN React + Babel in iframe srcdoc. */
export function buildArtifactPreviewSrcdoc(
  files: ArtifactFile[],
  options: ArtifactPreviewOptions = {},
): string {
  const entry = pickAppModulePath(files);
  const modules = prepareModuleMap(files, options);
  const css = escapeStyleClose(collectCss(files));
  const payload = JSON.stringify({
    entry,
    modules,
    projectId: options.projectId ?? "",
    installationId: options.installationId ?? "",
    sessionId: options.sessionId ?? "",
  });

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>Radiant preview</title>
<script src="https://cdn.tailwindcss.com"><\/script>
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
<div id="preview-loader" aria-live="polite" style="position:fixed;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;background:var(--hero-bg);z-index:10;">
  <div style="display:flex;gap:6px;align-items:center;">
    <span style="width:10px;height:10px;border-radius:9999px;background:var(--hero-violet);animation:radiant-bounce 0.9s ease-in-out infinite;"></span>
    <span style="width:10px;height:10px;border-radius:9999px;background:var(--hero-amber);animation:radiant-bounce 0.9s ease-in-out 0.15s infinite;"></span>
    <span style="width:10px;height:10px;border-radius:9999px;background:var(--hero-mint);animation:radiant-bounce 0.9s ease-in-out 0.3s infinite;"></span>
  </div>
  <p style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.2em;color:rgba(26,26,26,0.45);margin:0;">Building preview…</p>
</div>
<style>
@keyframes radiant-bounce {
  0%, 80%, 100% { transform: translateY(0); opacity: 0.55; }
  40% { transform: translateY(-8px); opacity: 1; }
}
</style>
<div id="root"></div>
<div id="error" hidden style="padding:1rem;color:#ff5d46;font-weight:700;font-size:14px;"></div>
<script src="https://unpkg.com/@babel/standalone@7/babel.min.js"><\/script>
<script src="https://unpkg.com/react@18/umd/react.development.js"><\/script>
<script src="https://unpkg.com/react-dom@18/umd/react-dom.development.js"><\/script>
<script>
(function () {
  if (typeof process === "undefined") {
    window.process = { env: {} };
  }
  const payload = ${payload};
  const errEl = document.getElementById("error");
  const SOURCE_EXTS = [".tsx", ".ts", ".jsx", ".js"];

  if (payload.projectId) {
    window.__RADIANT_PROJECT_ID__ = payload.projectId;
  }
  if (payload.installationId) {
    window.__RADIANT_INSTALLATION_ID__ = payload.installationId;
  }
  if (payload.sessionId) {
    window.__RADIANT_SESSION_ID__ = payload.sessionId;
  }
  window.addEventListener("message", function (event) {
    var data = event.data;
    if (!data || data.type !== "${RADIANT_AGENT_EVENT_TYPE}") return;
    if (typeof window.__radiantAgent?.handleExternalEvent === "function") {
      window.__radiantAgent.handleExternalEvent(data);
    }
  });
  window.__RADIANT_PREVIEW_FETCH__ = function(path, init) {
    return new Promise(function(resolve, reject) {
      var requestId = "preview-" + Math.random().toString(36).slice(2);
      function onMessage(event) {
        var data = event.data;
        if (!data || data.type !== "${PREVIEW_API_RESPONSE}" || data.requestId !== requestId) return;
        window.removeEventListener("message", onMessage);
        if (data.error) {
          reject(new Error(data.error));
          return;
        }
        resolve(new Response(data.body || "", {
          status: data.status || 200,
          headers: { "Content-Type": "application/json" },
        }));
      }
      window.addEventListener("message", onMessage);
      window.parent.postMessage({
        type: "${PREVIEW_API_REQUEST}",
        requestId: requestId,
        path: path,
        method: (init && init.method) || "GET",
        body: init && init.body ? String(init.body) : undefined,
      }, "*");
    });
  };

  function hideLoader() {
    const loader = document.getElementById("preview-loader");
    if (loader) loader.remove();
  }
  function notifyParent(status, extra) {
    try {
      var msg = { type: "radiant-artifact-preview", status: status };
      if (extra) {
        for (var k in extra) msg[k] = extra[k];
      }
      window.parent.postMessage(msg, "*");
    } catch (_) {}
  }
  function readHashPath() {
    var raw = (window.location.hash || "").replace(/^#/, "");
    if (!raw) return "/";
    return raw.startsWith("/") ? raw : "/" + raw;
  }
  function setHashPath(path) {
    var normalized = path === "/" ? "" : path.startsWith("/") ? path : "/" + path;
    window.location.hash = normalized ? "#" + normalized.replace(/^#/, "") : "";
  }
  function notifyPath(path) {
    notifyParent("path", { path: path });
  }
  function bindPreviewNavigation() {
    function onHash() {
      notifyPath(readHashPath());
    }
    function onMessage(event) {
      var data = event.data;
      if (!data || data.type !== "radiant-artifact-preview-navigate") return;
      setHashPath(data.path || "/");
    }
    window.addEventListener("hashchange", onHash);
    window.addEventListener("message", onMessage);
    notifyPath(readHashPath());
    return function () {
      window.removeEventListener("hashchange", onHash);
      window.removeEventListener("message", onMessage);
    };
  }
  function createPreviewRouterDom(React) {
    var createContext = React.createContext;
    var useContext = React.useContext;
    var useState = React.useState;
    var useEffect = React.useEffect;
    var RouterCtx = createContext(null);
    function HashRouter(props) {
      var children = props.children;
      var _useState = useState(readHashPath);
      var path = _useState[0];
      var setPath = _useState[1];
      useEffect(function () {
        function onHash() {
          setPath(readHashPath());
        }
        function onMessage(event) {
          var data = event.data;
          if (!data || data.type !== "radiant-artifact-preview-navigate") return;
          setHashPath(data.path || "/");
        }
        window.addEventListener("hashchange", onHash);
        window.addEventListener("message", onMessage);
        return function () {
          window.removeEventListener("hashchange", onHash);
          window.removeEventListener("message", onMessage);
        };
      }, []);
      var navigate = function (to) {
        setHashPath(to);
      };
      return React.createElement(
        RouterCtx.Provider,
        { value: { path: path, navigate: navigate } },
        children
      );
    }
    function useRouter() {
      var ctx = useContext(RouterCtx);
      if (!ctx) throw new Error("Router hooks require HashRouter or BrowserRouter");
      return ctx;
    }
    function useLocation() {
      return { pathname: useRouter().path, search: "", hash: "", state: null, key: "default" };
    }
    function useNavigate() {
      return useRouter().navigate;
    }
    function matchPath(pathname, pattern) {
      if (pattern === "*") return true;
      return pattern === pathname;
    }
    function Routes(props) {
      var children = props.children;
      var path = useRouter().path;
      var routes = React.Children.toArray(children);
      for (var i = 0; i < routes.length; i++) {
        var child = routes[i];
        if (!child || !child.props) continue;
        var routePath = child.props.path || "/";
        if (matchPath(path, routePath)) {
          return child.props.element;
        }
      }
      return null;
    }
    function Route() {
      return null;
    }
    function Link(props) {
      var to = props.to || "/";
      var navigate = useNavigate();
      return React.createElement(
        "a",
        {
          href: to === "/" ? "#" : "#" + (to.startsWith("/") ? to : "/" + to),
          className: props.className,
          onClick: function (e) {
            e.preventDefault();
            navigate(to);
          },
        },
        props.children
      );
    }
    return {
      HashRouter: HashRouter,
      BrowserRouter: HashRouter,
      MemoryRouter: HashRouter,
      Routes: Routes,
      Route: Route,
      Link: Link,
      NavLink: Link,
      useNavigate: useNavigate,
      useLocation: useLocation,
      Outlet: function () { return null; },
    };
  }
  function showError(msg) {
    hideLoader();
    notifyParent("error");
    errEl.hidden = false;
    errEl.textContent = msg;
  }

  function stripExt(path) {
    for (var i = 0; i < SOURCE_EXTS.length; i++) {
      var ext = SOURCE_EXTS[i];
      if (path.endsWith(ext)) return path.slice(0, -ext.length);
    }
    return path;
  }
  function resolveRelativeImport(fromPath, request) {
    var baseDir = fromPath.includes("/") ? fromPath.slice(0, fromPath.lastIndexOf("/")) : "";
    var joined;
    if (request.indexOf("./") === 0) {
      joined = baseDir ? baseDir + "/" + request.slice(2) : request.slice(2);
    } else if (request.indexOf("../") === 0) {
      var parts = baseDir.split("/");
      var rest = request;
      while (rest.indexOf("../") === 0) {
        if (!parts.length) return null;
        parts.pop();
        rest = rest.slice(3);
      }
      joined = parts.length ? parts.join("/") + "/" + rest : rest;
    } else if (request.indexOf("/") === 0) {
      joined = request.slice(1);
    } else {
      return null;
    }
    var candidates = [joined];
    for (var j = 0; j < SOURCE_EXTS.length; j++) {
      candidates.push(stripExt(joined) + SOURCE_EXTS[j]);
    }
    for (var k = 0; k < candidates.length; k++) {
      if (payload.modules[candidates[k]]) return candidates[k];
    }
    return null;
  }

  var npmRegistry = null;
  function createNpmRegistry() {
  var routerDom = createPreviewRouterDom(React);
    return {
      react: React,
      "react-dom": ReactDOM,
      "react-dom/client": { createRoot: ReactDOM.createRoot.bind(ReactDOM) },
      "react/jsx-runtime": {
        jsx: React.createElement,
        jsxs: React.createElement,
        Fragment: React.Fragment,
      },
      "react-router-dom": routerDom,
      "react-router": {
        Routes: routerDom.Routes,
        Route: routerDom.Route,
        Link: routerDom.Link,
        NavLink: routerDom.NavLink,
        Outlet: routerDom.Outlet,
        useNavigate: routerDom.useNavigate,
        useLocation: routerDom.useLocation,
      },
    };
  }

  var moduleCache = {};
  function loadModule(moduleId) {
    if (moduleCache[moduleId]) return moduleCache[moduleId];
    var source = payload.modules[moduleId];
    if (!source) {
      throw new Error("Missing module: " + moduleId);
    }
    var transformed = Babel.transform(source, {
      presets: [
        ["env", { modules: "commonjs" }],
        ["react", { runtime: "classic" }],
        "typescript",
      ],
      filename: moduleId,
    }).code;
    var module = { exports: {} };
    var exports = module.exports;
    var registry = npmRegistry || createNpmRegistry();
    function localRequire(request) {
      if (registry[request]) return registry[request];
      if (request.endsWith(".css") || request.endsWith(".scss")) return {};
      var resolved = resolveRelativeImport(moduleId, request);
      if (!resolved) {
        throw new Error(
          "Preview cannot load module: " + request + " (from " + moduleId + "). Use app/, components/, or lib/ paths and react / react-dom / react-router-dom only for npm.",
        );
      }
      return loadModule(resolved);
    }
    var fn = new Function("React", "ReactDOM", "require", "exports", "module", transformed);
    fn(React, ReactDOM, localRequire, exports, module);
    moduleCache[moduleId] = module.exports;
    return module.exports;
  }

  if (!payload.entry || !payload.modules[payload.entry]) {
    showError("No app/page.tsx found — ask your agent to add a Next.js entry that composes your components.");
    return;
  }

  try {
    npmRegistry = createNpmRegistry();
    // Next.js layout.tsx is not executed in chat preview — bootstrap platform libs first.
    var platformBoot = ["lib/radiant-client.ts", "lib/radiant-agent-runtime.ts"];
    for (var bi = 0; bi < platformBoot.length; bi++) {
      var bootId = platformBoot[bi];
      if (payload.modules[bootId]) {
        loadModule(bootId);
      }
    }
    var entryExports = loadModule(payload.entry);
    var App = entryExports.default || entryExports;
    if (typeof App !== "function") {
      throw new Error("app/page.tsx must default-export a React component.");
    }
    ReactDOM.createRoot(document.getElementById("root")).render(React.createElement(App));
    bindPreviewNavigation();
    hideLoader();
    notifyParent("ready");
    notifyPath(readHashPath());
  } catch (e) {
    showError(e && e.message ? e.message : String(e));
  }
})();
<\/script>
</body>
</html>`;
}

/** @deprecated use pickAppModulePath — kept for tests */
export function pickAppSource(files: ArtifactFile[]): string {
  const entry = pickAppModulePath(files);
  if (!entry) return "";
  const map = buildModuleSourceMap(files);
  return map[entry] ?? "";
}

export { normalizeArtifactPath };
