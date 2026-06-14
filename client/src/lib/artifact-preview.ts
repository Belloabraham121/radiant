import type { ArtifactFile } from "@/lib/artifact-types";

function escapeStyleClose(css: string): string {
  return css.replace(/<\/style/gi, "<\\/style");
}

function normalizeArtifactPath(path: string): string {
  return path.replace(/^\/+/, "").replace(/^\/workspace\//, "");
}

function buildFileMap(files: ArtifactFile[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const file of files) {
    map.set(normalizeArtifactPath(file.path), file.content);
  }
  return map;
}

function pickAppSource(files: ArtifactFile[]): string {
  const byPath = buildFileMap(files);
  return byPath.get("src/App.tsx") ?? byPath.get("src/App.jsx") ?? "";
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
  return stripCssImports(source);
}

/** Client-side preview HTML — no E2B. Uses CDN React + Babel in iframe srcdoc. */
export function buildArtifactPreviewSrcdoc(files: ArtifactFile[]): string {
  const rawAppSource = pickAppSource(files);
  const appSource = prepareAppSourceForPreview(rawAppSource);
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
  const payload = ${payload};
  const errEl = document.getElementById("error");
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
  if (!payload.app) {
    showError("No src/App.tsx found — ask your agent to add one.");
    return;
  }
  function createPreviewRequire() {
    var routerDom = createPreviewRouterDom(React);
    const registry = {
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
    return function previewRequire(name) {
      if (registry[name]) return registry[name];
      if (name.endsWith(".css") || name.endsWith(".scss")) {
        return {};
      }
      throw new Error(
        "Preview cannot load module: " + name + " (chat preview supports React only — put styles in src/*.css or inline styles; no lucide/npm imports)",
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
