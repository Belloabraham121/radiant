# App builder, artifacts & deploy — implementation TODO

Claude-style **artifacts in chat**, **published projects** (shareable Walrus links), and **explorer listings**. This doc is the **single source of truth** for what to build, how to set it up, and how to stay within **E2B Hobby (free) plan** limits.

**North star:** User asks agent to build → artifact panel opens with code + preview → deploy → permanent `*.walrus.site` URL → optional public explorer listing with fees.

**References**

- [README — Deploy pipeline](../README.md#deploy-pipeline)
- [E2B Billing & Plans (Hobby = free tier)](https://e2b.mintlify.app/docs/billing#plans)
- [E2B Filesystem — 10 GB Hobby disk](https://e2b.mintlify.app/docs/filesystem)
- [E2B Template caching](https://e2b.mintlify.app/docs/template/caching)
- [E2B Sandbox persistence / pause](https://e2b.mintlify.app/docs/sandbox/persistence)
- [E2B Usage cost calculator](https://e2b.dev/pricing)
- [Walrus Sites](https://docs.wal.app/)
- Client mocks to replace: `client/src/lib/app-data.ts`, `client/src/lib/explorer-data.ts`

**Tracked in:** [backend/docs/TODO.md — Phase 11](../backend/docs/TODO.md)

### Doc convention — production vs test implementations

Whenever you implement something that is **in-memory**, **mocked**, **stubbed**, or **process-local only** (not safe or not intended for production), add a block in **this doc** under [Production picker — what to use where](#production-picker--what-to-use-where) (or link a child section). Include:

1. **What it is** (file / class / env flag)
2. **Use in production?** Yes / No / Partial
3. **When to pick it** (local dev, CI, staging, prod path)
4. **What breaks if you pick wrong** (billing, fake deploys, memory, security)
5. **Correct production alternative**

This keeps env choices obvious without re-reading the codebase.

---

## ⚠️ E2B Hobby (free) plan — read this first

Radiant targets **E2B Hobby** for hackathon / early dev. You pay **per second while a sandbox is running**. Hobby includes **$100 one-time credits** (not monthly). When credits are gone, sandboxes stop unless you upgrade to Pro ($150/mo).

### Hard limits (Hobby tier)

| Limit | Hobby value | Impact on Radiant |
| ----- | ----------- | ----------------- |
| **Base price** | $0/month | Free tier; watch credit burn |
| **Free credits** | **$100 one-time** | ~hundreds of deploys if optimized; ~dozens if wasteful |
| **Max vCPUs per sandbox** | 8 | Use **2** for builds (enough for Vite); don't allocate 8 unless needed |
| **Max memory per sandbox** | 8 GB | Use **2048 MB** runtime, **4096 MB** template build |
| **Disk per sandbox** | **10 GB** | `node_modules` + scaffold must fit; no duplicate installs |
| **Max continuous runtime** | **1 hour** | Deploy must finish in <10 min; kill immediately after |
| **Concurrent running sandboxes** | 20 | Set Radiant `DEPLOY_MAX_CONCURRENT=2` on Hobby |
| **Concurrent template builds** | 20 | Only rebuild template in CI when scaffold changes |
| **Sandbox creation rate** | **1 / second** | Queue deploy jobs; don't burst-create sandboxes |
| **Default sandbox timeout** | 5 minutes | Override with `timeoutMs` but keep ≤10 min for deploy |
| **Paused sandboxes** | Free, unlimited | **Do not use for deploy** — orphans need manual `kill` |
| **Template count** | Unlimited | One `radiant-build` template is enough |

### Design rule for free tier

> **Every E2B second costs money. Zero sandbox seconds for: chat preview, artifact editing, template-only deploys, and failed retries without caps.**

---

## Budget model (Hobby credits)

Use the [E2B usage cost calculator](https://e2b.dev/pricing) with your chosen vCPU/RAM. Plan targets:

| Deploy path | Target sandbox time | E2B cost |
| ----------- | ------------------- | -------- |
| **Template-only** (Phase 3) | **0 seconds** | **$0** |
| **Optimized E2B build** (Phase 4) | 60–120 seconds | Low |
| **Wasteful E2B build** (cold npm install, no kill) | 5–15+ minutes | **Burns credits fast** |

### Target pipeline timing (E2B path)

| Step | Target duration | Notes |
| ---- | --------------- | ----- |
| `Sandbox.create` | 2–5 s | Use custom template alias |
| `cp scaffold → /workspace` | 1–3 s | Local copy, no network |
| Write artifact files | 1–5 s | Batch writes; ≤512 KB total |
| `pnpm build` | 15–45 s | Preinstalled deps in template |
| Walrus upload (from sandbox or backend) | 10–30 s | Prefer backend upload of tarball |
| `sandbox.kill()` | <1 s | **Mandatory** |
| **Total** | **~30–90 s** | Well under 1 h Hobby limit |

### Credit protection (implement all)

| Status | Task | Detail |
| ------ | ---- | ------ |
| [ ] | `DeployJob.sandbox_seconds` column | Billable seconds per job |
| [ ] | `DeployJob.estimated_cost_usd` | From E2B execution webhook or vCPU×time formula |
| [ ] | Dashboard: credits remaining | Poll E2B team metrics API weekly |
| [ ] | Alert at 80% credits burned | Slack/email; switch `SANDBOX_PROVIDER=none` automatically |
| [ ] | Per-user deploy quota | e.g. 5 E2B deploys/day on Hobby |
| [ ] | Reject deploy if credits < threshold | Fail fast with user message |
| [ ] | Log `sandbox.lifecycle.killed` webhooks | Reconcile orphan billing |

---

## Optimization playbook (Hobby / free tier)

### Sandbox lifecycle (critical)

| # | Rule | Why (Hobby) |
| - | ---- | ----------- |
| 1 | **Always `await sandbox.kill()` in `finally`** | Running sandboxes bill per second |
| 2 | **Never leave default 5 min timeout running idle** | Burns credits after job done |
| 3 | **Do not pause deploy sandboxes** | Pause is for IDE sessions; deploy = one-shot kill |
| 4 | **Set `timeoutMs: 600_000` max (10 min)** | Fail fast; well under 1 h cap |
| 5 | **Set `lifecycle.onTimeout: 'kill'` for deploy** | Not pause — paused deploy sandboxes clutter account |
| 6 | **Tag metadata** `{ projectId, jobId, userId }` | Orphan cleanup via CLI |
| 7 | **Cron: `e2b sandbox kill --all --state=running`** | Safety net every 15 min in dev |
| 8 | **Cron: kill paused sandboxes older than 24 h** | Paused is free but manual kill required eventually |

### Template & filesystem (critical)

| # | Rule | Why (Hobby) |
| - | ---- | ----------- |
| 9 | **Preinstall `node_modules` in template build** | Never `pnpm install` on deploy path |
| 10 | **Pin `pnpm-lock.yaml`** | Reproducible template layer cache |
| 11 | **Keep scaffold `node_modules` < 400 MB** | 10 GB disk − OS − CLIs − workspace headroom |
| 12 | **Use `cp -a /opt/radiant-scaffold/. /workspace/`** | Faster than re-uploading files from backend |
| 13 | **Write only changed artifact paths** | Minimize `files.write` round trips |
| 14 | **Exclude `dist/`, `.git`, maps from upload** | Smaller writes |
| 15 | **Template layer order: OS → CLIs → lockfile → install → copy src skeleton** | E2B caches layers; see [template caching](https://e2b.mintlify.app/docs/template/caching) |
| 16 | **Rebuild template only when lockfile/CLIs change** | Template builds also consume time/credits |
| 17 | **One template alias `radiant-build:v1`** | Tag new versions; don't proliferate templates |

### Compute sizing (critical)

| # | Rule | Why (Hobby) |
| - | ---- | ----------- |
| 18 | **Runtime sandbox: 2 vCPU, 2048 MB** | Vite build fits; cheaper than 4 GB |
| 19 | **Template build: 2 vCPU, 4096 MB** | Template build step only (CI) |
| 20 | **Extend `commands.run` timeout to 300s for build** | Default 60s fails → retry → **2× cost** |
| 21 | **`DEPLOY_MAX_CONCURRENT=2` on Hobby** | Leaves headroom under 20 limit; avoids rate limit |

### Product path (critical)

| # | Rule | Why (Hobby) |
| - | ---- | ----------- |
| 22 | **Artifact preview = client iframe (`srcdoc`)** | **Zero E2B** |
| 23 | **Phase 3 template-only Walrus before E2B** | Real links at $0 sandbox cost |
| 24 | **Fixed templates skip E2B entirely** | escrow/swap/splitter use pre-built `dist/` |
| 25 | **E2B only for `template: custom` with edited source** | Custom codegen is the only case worth credits |
| 26 | **Dedupe deploy jobs** | Same `project_id` + revision → reject if job running |
| 27 | **Max 2 retries per deploy job** | Failed builds shouldn't loop burn credits |

### Walrus & output (important)

| # | Rule | Why |
| - | ---- | --- |
| 28 | **Vite static export only** | Smaller `dist/` than Next.js |
| 29 | **Compress assets in scaffold** | `vite build` minify + tree-shake |
| 30 | **Upload `dist/` tarball from backend** | Kill sandbox before Walrus upload if possible |
| 31 | **Store config JSON in Walrus blob once** | Don't re-upload unchanged config |

---

## Product behavior (detailed)

| Scenario | Expected behavior | Sandbox? |
| -------- | ----------------- | -------- |
| User: “Build me a payment splitter” | `select_template` → `generate_app` → panel opens | **No** |
| User edits UI in chat | `generate_app` patches files; preview updates | **No** |
| User: “Deploy it” (custom template) | Queue E2B job → progress → `walrus_url` | **Yes** (~60–120s) |
| User: “Deploy it” (fixed template) | Inject config → upload pre-built `dist/` | **No** |
| User opens **Projects** | Real DB rows; status badges | **No** |
| User: “List on explorer 0.3% fee” | `register_app` → `/explorer` listing | **No** |
| Explorer visitor clicks **Use app** | Opens `walrus_url` in new tab | **No** |
| Deploy fails (OOM / timeout) | Job `failed`; sandbox killed; user sees logs | Kill in `finally` |
| Credits exhausted | Block E2B deploy; offer template-only path | **No** |

### Out of scope (v1)

- Next.js SSR on Walrus
- Arbitrary npm packages at runtime (whitelist: react, tailwind, lucide-react only)
- Multi-user artifact editing
- E2B pause/resume for deploy sessions
- EU region (Pro only per E2B docs)

---

## Architecture

```text
Client
  ChatView.tsx ──────────────► ArtifactPanel.tsx (preview: srcdoc, NO E2B)
  /app/projects ─────────────► GET /api/v1/projects
  /explorer ─────────────────► GET /api/v1/apps
            │
            ▼
Backend API (Express — never spawn E2B in request thread)
  POST /api/v1/chat ─────────► generate_app | deploy_app tools
  POST /api/v1/deploy ───────► enqueue BullMQ job → return job_id
  GET  /api/v1/deploy/:id ───► status + logs (poll)
            │
            ▼
workers/deploy.worker.ts (separate process)
  DEPLOY_MAX_CONCURRENT=2 (Hobby)
            │
            ▼
services/sandbox/sandbox.provider.ts
  ├── none.provider.ts      Phase 3 — template-only, $0
  ├── e2b.provider.ts       Phase 4 — Hobby credits
  └── mock.provider.ts      tests
            │
            ▼
services/walrus/ + services/deploy/deploy.service.ts
            │
            ▼
Postgres: Project | ArtifactFile | DeployJob
Walrus Sites: *.walrus.site
Sui: AppRegistry (Phase 5)
```

### New backend files (create these)

```text
backend/
├── docker/e2b/
│   ├── template.ts
│   ├── build.prod.ts
│   ├── e2b.toml
│   └── scaffold/                 # Vite + React + Tailwind
├── docker/deploy-worker/         # Phase 6 — optional
├── src/services/sandbox/
│   ├── sandbox.provider.ts         # interface
│   ├── e2b.provider.ts
│   ├── none.provider.ts
│   └── mock.provider.ts
├── src/services/deploy/
│   ├── deploy.service.ts
│   ├── template-registry.ts
│   ├── pipeline.ts
│   └── job-types.ts
├── src/services/walrus/
│   ├── sites.client.ts
│   └── blobs.client.ts
├── src/services/projects/
│   ├── project.repository.ts
│   └── artifact.repository.ts
├── src/workers/deploy.worker.ts
├── src/api/routes/v1/build/
├── src/api/routes/v1/deploy/
├── src/api/routes/v1/projects/
└── src/api/routes/v1/apps/
```

### New client files

```text
client/src/
├── components/app/ArtifactPanel.tsx
├── components/app/ArtifactFileTree.tsx
├── components/app/ArtifactCodeView.tsx
├── components/app/ArtifactPreview.tsx
├── components/app/DeployProgress.tsx
├── components/app/ArtifactContext.tsx
├── lib/projects-api.ts
├── lib/deploy-api.ts
└── lib/artifact-types.ts
```

---

## `SandboxProvider` interface

```typescript
// backend/src/services/sandbox/sandbox.provider.ts

export type SandboxRunResult = {
  exitCode: number;
  stdout: string;
  stderr: string;
  durationMs: number;
};

export type SandboxFileWrite = { path: string; content: string };

export interface SandboxProvider {
  readonly name: "none" | "e2b" | "docker" | "mock";

  /** Spawn environment. Returns handle id for kill. */
  create(ctx: {
    jobId: string;
    projectId: string;
    userId: string;
  }): Promise<{ handleId: string }>;

  /** Write files under /workspace (E2B) or job dir (Docker). */
  writeFiles(handleId: string, files: SandboxFileWrite[]): Promise<void>;

  /** Run shell command with timeout. Stream logs via onLine callback. */
  run(
    handleId: string,
    command: string,
    options: { cwd: string; timeoutMs: number; onLine?: (line: string) => void },
  ): Promise<SandboxRunResult>;

  /** Read file bytes (e.g. dist/index.html). */
  readFile(handleId: string, path: string): Promise<Buffer>;

  /** Read directory listing for dist upload. */
  listDir(handleId: string, path: string): Promise<string[]>;

  /** MUST be called in finally — especially on Hobby plan. */
  kill(handleId: string): Promise<void>;
}
```

| Status | Task | Owner |
| ------ | ---- | ----- |
| [x] | Define interface + types | [Backend] |
| [x] | `MockSandboxProvider` for unit tests | [Backend] |
| [x] | `NoneSandboxProvider` (no-op create/kill) | [Backend] |
| [x] | Factory `getSandboxProvider()` from env | [Backend] |

---

## Production picker — what to use where

Use this section when choosing env vars, providers, or any implementation that keeps state **in the Node process** instead of on E2B / Postgres / Walrus.

### `SANDBOX_PROVIDER` — pick one per environment

| Value | Production? | What actually runs | Pick when | Do **not** pick when |
| ----- | ----------- | ------------------ | --------- | -------------------- |
| **`none`** | ✅ **Yes** (default prod path for fixed templates) | No remote sandbox. `NoneSandboxProvider` — create/kill are no-ops; pipeline copies **pre-built** `templates/{name}/dist/` from disk and uploads to Walrus. | Escrow, swap, prediction template deploys (Phase 3). Early prod before custom codegen ships. | User chose **custom** template and agent generated real `src/` that must be compiled with Vite. |
| **`e2b`** | ✅ **Yes** (custom codegen only) | Real E2B cloud sandbox (`radiant-build:v1`). Vite build runs remotely; `dist/` read back for Walrus. **Costs credits per second** while sandbox is running. | `template === 'custom'` deploy jobs only. Staging smoke tests (budgeted). | Fixed templates (wastes credits). Chat preview / artifact iframe (use client `srcdoc`). CI on every PR. |
| **`mock`** | ❌ **Never production** | `MockSandboxProvider` — **fully in-memory** fake sandbox (`Map<jobId, Map<path, Buffer>>`). Does not run Node/Vite; `npm run build` returns fake success. | **Unit tests**, **GitHub Actions CI**, local dev when you are not testing E2B. | Any environment where users expect a real `*.walrus.site` from custom code. |
| **`docker`** | ⚠️ **Not ready** (placeholder) | Currently aliases to **`mock`** until Phase 6 self-hosted worker exists. | Nothing in prod yet. | Production until `DockerSandboxProvider` is implemented. |

**Recommended production matrix**

| Environment | `SANDBOX_PROVIDER` | Notes |
| ----------- | ------------------ | ----- |
| **Production (ship fixed templates first)** | `none` | $0 E2B; Walrus from repo `dist/` |
| **Production (custom apps enabled)** | `none` for fixed + `e2b` only when job is custom* | *Ideally pipeline selects provider per job, not one global env — until then, `e2b` if all deploys are custom |
| **Staging** | `none` or `e2b` | Manual E2B smoke with credit budget |
| **CI / PR checks** | `mock` | No E2B credits |
| **Local dev** | `mock` or `none` | `e2b` only when testing template/build |

### In-memory implementations already in the codebase

| Component | File | In-memory? | Production-safe? | Explanation |
| --------- | ---- | ---------- | ---------------- | ----------- |
| **Mock sandbox (files + handles)** | `backend/src/services/sandbox/mock.provider.ts` | ✅ Yes — `Map` of job handles and file `Buffer`s in Node heap | ❌ **Test/CI only** | Simulates write/run/read without cloud. Artifacts sit in process memory; no real build output. **Misconfiguring `SANDBOX_PROVIDER=mock` in prod = fake deploys.** |
| **E2B handle registry** | `backend/src/services/sandbox/e2b.provider.ts` (`sandboxes` Map) | ⚠️ **Partial** — Map stores **SDK client references**, not file contents | ✅ **Yes** (with rules) | Remote sandbox lives on E2B; Map only maps `jobId → Sandbox` so the same worker can call `run`/`kill`. Files are on E2B disk. **Not a substitute for E2B** — just bookkeeping. Requires `kill()` in pipeline `finally`; orphaned entries still bill on E2B until timeout. |
| **None provider** | `backend/src/services/sandbox/none.provider.ts` | No sandbox state | ✅ **Yes** for template-only deploy | Correct prod choice when Walrus upload uses repo `dist/`, not sandbox build. |
| **Provider singleton** | `backend/src/services/sandbox/sandbox.factory.ts` (`cached` provider) | One provider instance per Node process | ✅ **Yes** | Normal for single-process API + worker. Each BullMQ worker process has its own Map; jobs must create→build→kill on the **same worker** (standard queue pattern). |
| **Artifact preview (client)** | `ArtifactPreview` iframe `srcdoc` (Phase 1) | Browser memory | ✅ **Yes** | Preview is client-side; **never** spin E2B for preview. |
| **Client mock data** | `app-data.ts`, `explorer-data.ts` | Static mocks | ❌ **Remove before prod UI** | Replace with API in Phase 1–3; not backend sandbox but same rule — mocks are not production data. |

### E2B-related env — production checklist

| Variable | Production value | Wrong value / risk |
| -------- | ---------------- | -------------------- |
| `SANDBOX_PROVIDER` | `none` (fixed templates) or `e2b` (custom only) | `mock` → fake builds; `docker` → still mock today |
| `E2B_API_KEY` | Set on server; never in client | Missing → E2B deploy fails; leaked → account abuse |
| `E2B_TEMPLATE_ALIAS` | `radiant-build:v1` | Wrong alias → sandbox create fails |
| `DEPLOY_MAX_CONCURRENT` | **`2`** on Hobby | `20` → credit burn + rate limits |
| `DEPLOY_SANDBOX_TIMEOUT_MS` | `600000` (10 min max) | Too high → idle billing after failures |
| `DEPLOY_E2B_MIN_CREDITS_USD` | e.g. `5` — block E2B when broke | Omit → deploy attempts drain last credits |

### Future implementations — add a row here when you ship in-memory code

| Component | File | Production? | Notes |
| --------- | ---- | ----------- | ----- |
| `DockerSandboxProvider` | `docker.provider.ts` (Phase 6) | ✅ Target prod alternative to E2B at scale | Replace `mock` fallback for `SANDBOX_PROVIDER=docker` |
| Deploy job log buffer | pipeline (planned) | ✅ Stream to Postgres/redis, not grow unbounded in-memory | Cap log lines per job |
| BullMQ in-process worker | `deploy.worker.ts` (planned) | ✅ One job per worker; don't share handles across workers | |

### Quick decision tree

```text
User deploy request
  ├─ template is escrow | swap | prediction?
  │     → SANDBOX_PROVIDER=none, pre-built dist/, Walrus from backend ($0 E2B)
  ├─ template is custom (agent-generated src)?
  │     → SANDBOX_PROVIDER=e2b, remote Vite build, kill sandbox before Walrus upload
  ├─ running tests or CI?
  │     → SANDBOX_PROVIDER=mock (in-memory; no credits)
  └─ only previewing code in chat?
        → no sandbox at all (client iframe / srcdoc)
```

---


### Step 0 — Account

| Status | Task | Command / detail |
| ------ | ---- | ---------------- |
| [x] | Create account at [e2b.dev](https://e2b.dev) | Hobby tier |
| [x] | Note **$100 credit balance** in dashboard | Billing tab |
| [x] | Create API key | Server-only; never in client |
| [x] | Add to `backend/.env` | `E2B_API_KEY=e2b_...` |
| [ ] | Optional team id | `E2B_TEAM_ID` for CLI |

### Step 1 — CLI & SDK

| Status | Task | Command / detail |
| ------ | ---- | ---------------- |
| [x] | Install CLI | `npm i -g @e2b/cli` |
| [x] | Login | `e2b auth login` |
| [x] | Verify | `e2b sandbox list --limit 5` → "No sandboxes found" |
| [x] | Add SDK | `cd backend && npm i e2b` |
| [x] | Pin SDK version in `package.json` | `e2b@^2.29.1` |

### Step 2 — Scaffold (disk budget)

**10 GB Hobby disk budget:**

| Component | Target size |
| --------- | ----------- |
| Base OS + tools | ~2 GB |
| Sui CLI + Walrus CLI | ~500 MB |
| `node_modules` (vite/react/tailwind) | **≤400 MB** |
| `/workspace` build artifacts | ~50 MB |
| Headroom | ~7 GB |

| Status | Task | Detail |
| ------ | ---- | ------ |
| [x] | Create minimal Vite React TS app | `backend/docker/e2b/scaffold/` (Vite 7 + React 19 + TS) |
| [x] | Add Tailwind v4 (match Radiant client tokens loosely) | `@tailwindcss/vite` + CSS vars in `index.css` (no separate config) |
| [x] | **No** Next.js in scaffold | Static export only |
| [x] | `npm install` locally; commit lockfile | `package-lock.json` (npm; pnpm blocked by parent workspace) |
| [x] | Measure `node_modules` size | **84 MB** (verified 2026-06-13; well under 400 MB) |
| [x] | Add `.dockerignore` / template ignore | `backend/docker/e2b/.dockerignore` excludes `node_modules`, `dist`, `.git` |
| [x] | Default `src/App.tsx` placeholder | Radiant-themed placeholder; agent overwrites |

**Scaffold `package.json` scripts:**

```json
{
  "scripts": {
    "build": "vite build",
    "preview": "vite preview --host 0.0.0.0 --port 4173"
  }
}
```

### Step 3 — Custom template `radiant-build`

**Layer order (cache-friendly — stable layers first):**

```typescript
// backend/docker/e2b/template.ts
import { Template } from "e2b";

export const template = Template()
  .fromImage("node:22-bookworm")
  // Layer 1 — OS packages (rarely changes)
  .aptInstall(["curl", "git", "ca-certificates", "ca-certificates", "build-essential"])
  // Layer 2 — CLIs (pin versions; bump intentionally)
  .runCmd("curl -fsSL https://.../sui-install.sh | sh") // pin SUI_VERSION env
  .runCmd("curl -fsSL https://.../walrus-install.sh | sh") // pin WALRUS_VERSION env
  // Layer 3 — dependency install (changes when lockfile changes)
  .setWorkdir("/opt/radiant-scaffold")
  .copy("scaffold/package.json", "/opt/radiant-scaffold/package.json")
  .copy("scaffold/pnpm-lock.yaml", "/opt/radiant-scaffold/pnpm-lock.yaml")
  .runCmd("corepack enable && pnpm install --frozen-lockfile")
  // Layer 4 — static scaffold files (changes more often)
  .copy("scaffold/vite.config.ts", "/opt/radiant-scaffold/vite.config.ts")
  .copy("scaffold/tailwind.config.ts", "/opt/radiant-scaffold/tailwind.config.ts")
  .copy("scaffold/index.html", "/opt/radiant-scaffold/index.html")
  .copy("scaffold/src/", "/opt/radiant-scaffold/src/")
  .runCmd("mkdir -p /workspace");
```

| Status | Task | Detail |
| ------ | ---- | ------ |
| [x] | `template.ts` as above | Layer order per E2B caching docs |
| [x] | `build.prod.ts` | `Template.build(template, 'radiant-build:v1', { cpuCount: 2, memoryMB: 4096 })` |
| [x] | Run locally once | `npm run e2b:template:build` (build ~25s after cache) |
| [x] | Verify template in dashboard | `radiant-build:v1` / template ID `b0t6vzuyn0a6z3xm1762` |
| [x] | Smoke test | `npm run e2b:smoke` — node, sui, npm build OK |
| [x] | Document rebuild policy | Rebuild on lockfile / `RADIANT_SUI_CLI_RELEASE` / scaffold changes only |

### Step 4 — `E2bSandboxProvider` implementation

> **Production vs test:** See [Production picker — what to use where](#production-picker--what-to-use-where). Summary: `MockSandboxProvider` = in-memory, CI only; `E2bSandboxProvider.sandboxes` Map = handle registry (prod OK); prod custom deploys use `SANDBOX_PROVIDER=e2b`; fixed templates use `none`.

```typescript
// Pseudocode — backend/src/services/sandbox/e2b.provider.ts
import { Sandbox } from "e2b";

const TEMPLATE = process.env.E2B_TEMPLATE_ALIAS ?? "radiant-build:v1";
const SANDBOX_TIMEOUT_MS = Number(process.env.DEPLOY_SANDBOX_TIMEOUT_MS ?? 600_000);

export class E2bSandboxProvider implements SandboxProvider {
  private sandboxes = new Map<string, Sandbox>();

  async create(ctx) {
    const sandbox = await Sandbox.create(TEMPLATE, {
      timeoutMs: SANDBOX_TIMEOUT_MS,
      metadata: {
        projectId: ctx.projectId,
        jobId: ctx.jobId,
        userId: ctx.userId,
        app: "radiant",
      },
      lifecycle: {
        onTimeout: "kill", // Hobby: don't pause deploy sandboxes
        autoResume: false,
      },
    });
    this.sandboxes.set(ctx.jobId, sandbox);
    await sandbox.commands.run("cp -a /opt/radiant-scaffold/. /workspace/", {
      cwd: "/",
      timeoutMs: 120_000,
    });
    return { handleId: ctx.jobId };
  }

  async kill(handleId: string) {
    const sandbox = this.sandboxes.get(handleId);
    if (sandbox) {
      await sandbox.kill();
      this.sandboxes.delete(handleId);
    }
  }
}
```

| Status | Task | Detail |
| ------ | ---- | ------ |
| [x] | Implement full provider | `e2b.provider.ts` — create, write, run, read, list, kill |
| [x] | `writeFiles` batch | Parallel `files.write` + path validation (no `..`) |
| [ ] | `run` streams to `DeployJob.logs` | Append via repository (pipeline Step 4) |
| [x] | `readFile` / list dist | `readFile` + `listDir` for Walrus upload |
| [ ] | **`kill` in `finally`** in pipeline | Non-negotiable on Hobby (deploy pipeline) |
| [x] | Handle `RateLimitError` | 1s backoff, up to 5 attempts on create |
| [x] | Unit test with mock | `tests/unit/sandbox/` — no real E2B in CI |

### Step 5 — Filesystem paths (strict)

| Path | R/W | Max size | Notes |
| ---- | --- | -------- | ----- |
| `/opt/radiant-scaffold/` | R | ~500 MB | Template baked |
| `/workspace/` | RW | use ≤200 MB | Working copy |
| `/workspace/src/**` | RW | ≤512 KB total source | Enforced in `generate_app` |
| `/workspace/dist/` | W | ≤20 MB | Vite output |
| `/workspace/move/` | RW | ≤1 MB | Move sources if publishing |

| Status | Task | Detail |
| ------ | ---- | ------ |
| [x] | Path allowlist validator | `sandbox-paths.ts` — `/workspace/src/`, `/workspace/public/` writes; `/workspace/move/` for Move publish |
| [x] | Extension allowlist | `.tsx`, `.ts`, `.css`, `.json`, `.html`, `.svg` (+ Move: `.move`, `.toml`, `.json`) |
| [x] | Total bytes guard | `DEPLOY_MAX_ARTIFACT_BYTES=524288`, `DEPLOY_MAX_DIST_BYTES`, `DEPLOY_MAX_MOVE_BYTES` |

### Step 6 — Volumes (optional, private beta)

E2B Volumes persist across sandbox lifetimes. **Private beta** — email support@e2b.dev.

| Status | Task | Detail |
| ------ | ---- | ------ |
| [ ] | **Skip for MVP on Hobby** | Preinstalled `node_modules` is enough |
| [ ] | Re-evaluate if pnpm store cache saves >30s | ROI vs complexity |
| [ ] | If enabled: shared volume at `/pnpm-store` | One volume, many sandboxes |

### Step 7 — Orphan cleanup (Hobby hygiene)

| Status | Task | Detail |
| ------ | ---- | ------ |
| [x] | Script `backend/scripts/e2b-cleanup.sh` | `e2b sandbox kill --all --state=running` |
| [ ] | Cron in dev / staging | Every 15 min — use `npm run e2b:cleanup` or `e2b:cleanup:radiant` |
| [x] | On deploy worker boot | `killStaleRadiantSandboxesOnBoot()` when `DEPLOY_KILL_STALE_SANDBOXES_ON_BOOT=true` |
| [ ] | Lifecycle webhook endpoint | Log killed events; reconcile `DeployJob` |

---

## Deploy pipeline (detailed steps)

```text
deploy.service.ts — runPipeline(job)

  1. LOAD project + artifact files (latest revision)
  2. VALIDATE size limits + template type
  3. SELECT provider:
       template !== 'custom'  → NoneSandboxProvider (Phase 3)
       template === 'custom'  → E2bSandboxProvider (Phase 4)
  4. IF provider !== none:
       a. create sandbox
       b. try:
            - writeFiles(artifact)
            - run: pnpm build (timeout 300s)
            - read dist/ OR tar dist/
          finally:
            - kill sandbox  ← ALWAYS
  5. IF provider === none:
       - copy pre-built dist/ from repo templates/{name}/dist/
       - inject config.json (addresses, package_id, theme)
  6. UPLOAD to Walrus Sites (from backend bytes — sandbox already dead)
  7. OPTIONAL: Move publish (Phase 5) — may need separate short sandbox OR backend signing only
  8. UPDATE Project: walrus_url, status=live
  9. UPDATE AgentMemory.app_history
 10. COMPLETE DeployJob + notify client
```

| Status | Task | Owner |
| ------ | ---- | ----- |
| [ ] | `pipeline.ts` with step enum + progress % | [Backend] |
| [ ] | Progress map: queued 0%, sandbox 10%, build 40%, walrus 70%, done 100% | [Backend] |
| [ ] | Idempotency key on POST /deploy | [Backend] |
| [ ] | Cancel job endpoint (optional) | [Backend] |

---

## Data model (Prisma — full)

### Migration: `add_projects_artifacts_deploy`

| Status | Task | Detail |
| ------ | ---- | ------ |
| [ ] | `npx prisma migrate dev --name add_projects_artifacts_deploy` | Never hand-name file |

```prisma
enum ProjectStatus {
  draft
  building
  deploying
  live
  failed
}

enum DeployJobStatus {
  queued
  running
  completed
  failed
  cancelled
}

model Project {
  id                 String        @id @default(uuid())
  user_id            String
  user               User          @relation(fields: [user_id], references: [id], onDelete: Cascade)
  session_id         String?
  session            ChatSession?  @relation(fields: [session_id], references: [id], onDelete: SetNull)
  name               String
  tagline            String        @default("")
  template           String        // escrow | swap | prediction | custom
  status             ProjectStatus @default(draft)
  accent             String        @default("#8e5bff")
  template_params    Json          @default("{}")
  package_id         String?
  walrus_url         String?
  walrus_blob_id     String?
  registry_object_id String?
  is_public          Boolean       @default(false)
  fee_bps            Int           @default(0)
  category           String        @default("payments")
  artifact_revision  Int           @default(0)
  created_at         DateTime      @default(now())
  updated_at         DateTime      @updatedAt
  files              ArtifactFile[]
  deploy_jobs        DeployJob[]

  @@index([user_id, updated_at(sort: Desc)])
  @@index([is_public, created_at(sort: Desc)])
}

model ArtifactFile {
  id         String   @id @default(uuid())
  project_id String
  project    Project  @relation(fields: [project_id], references: [id], onDelete: Cascade)
  path       String
  content    String
  revision   Int
  created_at DateTime @default(now())

  @@unique([project_id, path, revision])
  @@index([project_id, revision])
}

model DeployJob {
  id                  String          @id @default(uuid())
  project_id          String
  project             Project         @relation(fields: [project_id], references: [id], onDelete: Cascade)
  status              DeployJobStatus @default(queued)
  provider            String          // none | e2b | docker
  sandbox_id          String?
  sandbox_seconds     Int?
  estimated_cost_usd  Decimal?        @db.Decimal(10, 6)
  logs                String          @default("")
  error_message       String?
  artifact_revision   Int
  started_at          DateTime?
  finished_at         DateTime?
  created_at          DateTime        @default(now())

  @@index([project_id, created_at(sort: Desc)])
  @@index([status])
}
```

| Status | Task | Detail |
| ------ | ---- | ------ |
| [ ] | Add relations on `User`, `ChatSession` | |
| [ ] | Repository layer | `project.repository.ts`, `artifact.repository.ts` |
| [ ] | Cascade delete tests | User delete removes projects |

---

## Agent tools (schemas)

### `select_template`

```json
{
  "template": "escrow",
  "params": { "recipients": 3, "fee_bps": 30 }
}
```

| Status | Task | Detail |
| ------ | ---- | ------ |
| [ ] | `template-registry.ts` Zod schemas per template | |
| [ ] | Return human description + estimated gas | |
| [ ] | Map template → pre-built dist path OR custom | |

### `generate_app`

```json
{
  "project_id": "uuid-or-null",
  "name": "Splitz",
  "files": [{ "path": "src/App.tsx", "content": "..." }]
}
```

| Status | Task | Detail |
| ------ | ---- | ------ |
| [ ] | Create project if no `project_id` | Link to `session_id` |
| [ ] | Upsert files; bump `artifact_revision` | |
| [ ] | Return `ArtifactPayload` for client panel | |
| [ ] | Enforce 512 KB / 50 files | Uses `validateArtifactBatch()` in `sandbox-paths.ts` |
| [ ] | Whitelist paths under `src/`, `public/` | Uses `normalizeSandboxPath()` — **validator ready** |

### `deploy_app`

```json
{ "project_id": "uuid", "provider": "auto" }
```

`provider: auto` → `none` for fixed templates, `e2b` for custom (if credits OK).

| Status | Task | Detail |
| ------ | ---- | ------ |
| [ ] | Check credits before E2B enqueue | |
| [ ] | Reject if job already running for project | |
| [ ] | Return `{ job_id, status: "queued" }` | |

### `register_app`

```json
{
  "project_id": "uuid",
  "is_public": true,
  "fee_bps": 30,
  "category": "payments",
  "description": "..."
}
```

| Status | Task | Detail |
| ------ | ---- | ------ |
| [ ] | Requires `status === live` | |
| [ ] | Onchain tx via agent wallet | Phase 5 |
| [ ] | Upsert explorer listing row | |

---

## HTTP API (request/response shapes)

### `POST /api/v1/build`

```json
// Request
{ "template": "escrow", "params": { "recipients": 3 } }

// Response data
{
  "template": "escrow",
  "description": "Payment splitter across 3 wallets",
  "estimated_gas_sui": 0.05,
  "requires_sandbox": false
}
```

| Status | Task | Owner |
| ------ | ---- | ----- |
| [ ] | Route + handler | [Backend] |
| [ ] | Zod validation | [Backend] |
| [ ] | `@utoipa` doc (when added) | [Backend] |

### `POST /api/v1/deploy`

```json
// Request
{ "project_id": "uuid" }
// Header: Idempotency-Key

// Response data
{ "job_id": "uuid", "status": "queued", "provider": "none" | "e2b" }
```

| Status | Task | Owner |
| ------ | ---- | ----- |
| [ ] | Auth + ownership check | [Backend] |
| [ ] | Enqueue BullMQ | [Backend] |
| [ ] | Rate limit: 5/user/hour on Hobby | [Backend] |

### `GET /api/v1/deploy/:jobId`

```json
{
  "id": "uuid",
  "status": "running",
  "progress_pct": 40,
  "provider": "e2b",
  "sandbox_seconds": 45,
  "logs_tail": "... last 8kb ...",
  "walrus_url": null
}
```

| Status | Task | Owner |
| ------ | ---- | ----- |
| [ ] | Poll-friendly | [Backend] |
| [ ] | Redact secrets from logs | [Backend] |

### `GET /api/v1/projects` / `GET /api/v1/projects/:id`

| Status | Task | Owner |
| ------ | ---- | ----- |
| [ ] | Pagination `page`, `limit` | [Backend] |
| [ ] | Include latest deploy job summary | [Backend] |
| [ ] | `:id` includes files for current revision | [Backend] |

### `GET /api/v1/apps` (explorer)

| Status | Task | Owner |
| ------ | ---- | ----- |
| [ ] | Filter `is_public=true` only | [Backend] |
| [ ] | Sort: trending, newest, volume | [Backend] |
| [ ] | Shape matches `Agent` type in explorer | [Backend] |

---

## BullMQ worker setup

| Status | Task | Command / detail |
| ------ | ---- | ---------------- |
| [ ] | Queue name `radiant:deploy` | `infrastructure/redis/queues.ts` |
| [ ] | Worker concurrency **2** on Hobby | `DEPLOY_MAX_CONCURRENT=2` |
| [ ] | Limiter `{ max: 1, duration: 1000 }` | Respect 1 sandbox/sec creation |
| [ ] | Job timeout 15 min | BullMQ stall detection |
| [ ] | Dead letter queue | Failed after 2 retries |
| [ ] | Start worker | `tsx src/workers/deploy.worker.ts` |
| [ ] | Docker compose service (optional) | `deploy-worker` profile |
| [ ] | **Never run worker in `main.ts`** | Separate process |

```typescript
// Worker concurrency — Hobby plan
const worker = new Worker("radiant:deploy", processDeployJob, {
  connection: redis,
  concurrency: Number(process.env.DEPLOY_MAX_CONCURRENT ?? 2),
  limiter: { max: 1, duration: 1000 },
});
```

---

## Client — Artifact panel (detailed)

### `ArtifactContext`

| Status | Task | Detail |
| ------ | ---- | ------ |
| [x] | State: `projectId`, `files`, `activePath`, `revision`, `panelOpen` | |
| [x] | `openArtifact(payload)` from chat response | |
| [x] | `closePanel()` | |
| [x] | Persist open state per session in memory only | No localStorage |

### `ArtifactPanel.tsx`

| Status | Task | Detail |
| ------ | ---- | ------ |
| [x] | Split layout: chat 55% / panel 45% on `lg+` | |
| [x] | Mobile: panel full-width sheet below chat | |
| [x] | Tabs: **Preview** \| **Code** \| **Deploy** | Deploy tab placeholder until Phase 3 |
| [x] | Close button | |
| [x] | Match Radiant design tokens (`var(--hero-*)`) | |

### `ArtifactPreview.tsx` — **zero E2B cost**

| Status | Task | Detail |
| ------ | ---- | ------ |
| [x] | Build preview HTML from `index.html` + inlined CSS/JS | CDN React + Babel in iframe |
| [x] | Render in `<iframe sandbox="allow-scripts" srcDoc={...}>` | |
| [x] | **Do not** call E2B for preview on Hobby | Critical |
| [x] | Refresh on `artifact_revision` change | |
| [x] | Error boundary for bad JSX | Show friendly message in iframe |

### `DeployProgress.tsx`

| Status | Task | Detail |
| ------ | ---- | ------ |
| [ ] | Poll `GET /deploy/:jobId` every 2s while running | Stop on completed/failed |
| [ ] | Show progress bar + log tail | |
| [ ] | On success: show `walrus_url` + Copy link | |
| [ ] | On failure: show error + Retry button | |
| [ ] | Show `sandbox_seconds` when provider=e2b | Transparency for dev |

### Projects & explorer pages

| Status | Task | File |
| ------ | ---- | ---- |
| [ ] | `projects-api.ts` | `lib/projects-api.ts` |
| [ ] | Replace mock in projects list | `app/app/projects/page.tsx` |
| [ ] | Replace mock in project detail | `app/app/projects/[id]/page.tsx` |
| [ ] | Wire explorer grid to API | `components/explorer/AgentGrid.tsx` |
| [ ] | Wire explorer detail | `app/explorer/[id]/page.tsx` |
| [ ] | Delete mock `PROJECTS` usage | Keep types only |

---

## Environment variables (complete)

See [Production picker — what to use where](#production-picker--what-to-use-where) for **`SANDBOX_PROVIDER`** and in-memory/mock guidance.

| Variable | Required | Default | Production pick | Notes |
| -------- | -------- | ------- | ----------------- | ----- |
| `SANDBOX_PROVIDER` | yes | `none` | **`none`** (fixed templates) or **`e2b`** (custom only). **Never `mock`.** | `none` \| `e2b` \| `docker` \| `mock`. `docker` → mock until Phase 6. |
| `E2B_API_KEY` | if `e2b` | — | Required when provider is `e2b` | Server only; never client |
| `E2B_TEMPLATE_ALIAS` | if `e2b` | `radiant-build:v1` | `radiant-build:v1` | |
| `E2B_TEAM_ID` | no | — | Optional | CLI/template builds |
| `DEPLOY_SANDBOX_TIMEOUT_MS` | no | `600000` | `600000` | 10 min max; don't raise without reason |
| `DEPLOY_BUILD_COMMAND_TIMEOUT_MS` | no | `300000` | `300000` | Vite build inside sandbox |
| `DEPLOY_MAX_CONCURRENT` | no | **`2`** | **`2` on Hobby** | **Hobby: use 2, not 20** |
| `DEPLOY_MAX_PER_USER_PER_HOUR` | no | `5` | `5` or lower | Credit protection |
| `DEPLOY_E2B_MIN_CREDITS_USD` | no | `5` | Set in prod | Block E2B when credits low |
| `DEPLOY_MAX_ARTIFACT_FILES` | no | `50` | `50` | |
| `DEPLOY_MAX_ARTIFACT_BYTES` | no | `524288` | `524288` | 512 KB source cap |
| `DEPLOY_MAX_DIST_BYTES` | no | `20971520` | `20971520` | 20 MB Vite `dist/` cap |
| `DEPLOY_MAX_MOVE_BYTES` | no | `1048576` | `1048576` | 1 MB Move sources |
| `DEPLOY_MAX_MOVE_FILES` | no | `20` | `20` | Move source file count |
| `WALRUS_PUBLISHER_URL` | yes (deploy) | — | Required for any deploy | |
| `WALRUS_API_URL` | yes | — | Required | |
| `SUI_RPC_URL` | yes | — | mainnet URL in prod | Move publish |
| `RADIANT_REGISTRY_PACKAGE_ID` | Phase 5 | — | When explorer listing ships | |
| `REDIS_URL` | yes | `redis://localhost:6380` | Production Redis | BullMQ |

---

## Implementation phases (granular)

### Phase 1 — Artifacts (no sandbox, no Walrus, **$0 E2B**)

**Exit criteria:** User asks agent to build → panel opens → preview in iframe → draft in Postgres.

| Status | Task | Implementation detail | Owner |
| ------ | ---- | --------------------- | ----- |
| [x] | Prisma migration | Models above | [Backend] |
| [x] | `project.repository.ts` | CRUD, list by user | [Backend] |
| [x] | `artifact.repository.ts` | upsert files, get by revision | [Backend] |
| [x] | `generate_app` service | Size limits, path allowlist | [Backend] |
| [x] | OpenAI tool definition | | [Backend] |
| [x] | `ArtifactPayload` type in chat response | `{ project_id, name, files[], revision }` | [Backend] |
| [x] | System prompt lines | When to call generate_app | [Backend] |
| [x] | `ArtifactContext` + provider | | [Client] |
| [x] | `ArtifactPanel` shell | Open on payload | [Client] |
| [x] | `ArtifactPreview` srcdoc | **No E2B** | [Client] |
| [x] | Wire `useChatSession` | Set artifact on response | [Client] |
| [x] | Unit: path allowlist | `tests/unit/sandbox/sandbox-paths.test.ts` |
| [x] | Unit: byte limit | `sandbox-paths.test.ts` |
| [x] | Integration: generate_app persists | `tests/integration/generate-app.test.ts` | [Backend] |

### Phase 2 — Build preview API (**$0 E2B**)

| Status | Task | Implementation detail | Owner |
| ------ | ---- | --------------------- | ----- |
| [ ] | `template-registry.ts` | escrow, swap, prediction schemas | [Backend] |
| [ ] | `select_template` tool | | [Backend] |
| [ ] | `POST /api/v1/build` route | No side effects | [Backend] |
| [ ] | Return `requires_sandbox: false` for fixed templates | | [Backend] |
| [ ] | Agent uses build before deploy in chat | | [Backend] |

### Phase 3 — Template-only Walrus deploy (**$0 E2B — ship first real links**)

**Exit criteria:** Fixed template deploy → real `*.walrus.site` URL → appears in Projects.

| Status | Task | Implementation detail | Owner |
| ------ | ---- | --------------------- | ----- |
| [ ] | Pre-build `templates/escrow/dist/` in repo | CI builds once | [Backend] |
| [ ] | Pre-build `templates/swap/dist/` | | [Backend] |
| [ ] | Config injection script | `config.json` with params | [Backend] |
| [ ] | `NoneSandboxProvider` | No-op sandbox | [Backend] |
| [ ] | `walrus/sites.client.ts` | Upload static files | [Backend] |
| [ ] | `deploy.service.ts` pipeline | Provider none path | [Backend] |
| [ ] | `DeployJob` + BullMQ queue | Still async for UX | [Backend] |
| [ ] | `deploy_app` tool | | [Backend] |
| [ ] | `POST /api/v1/deploy` | | [Backend] |
| [ ] | `GET /api/v1/deploy/:id` | Polling | [Backend] |
| [ ] | `GET /api/v1/projects` | | [Backend] |
| [ ] | `DeployProgress` UI | | [Client] |
| [ ] | Projects page real data | | [Client] |
| [ ] | Manual test: Walrus testnet URL opens | | [QA] |

### Phase 4 — E2B custom builds (Hobby credits — **optimize heavily**)

**Exit criteria:** Custom template project builds in E2B in <120s; sandbox always killed.

| Status | Task | Implementation detail | Owner |
| ------ | ---- | --------------------- | ----- |
| [ ] | `backend/docker/e2b/scaffold/` | Disk budget <400 MB | [Backend] |
| [ ] | `template.ts` + `build.prod.ts` | Layer caching | [Backend] |
| [ ] | Build template `radiant-build:v1` | 2 CPU, 4096 MB | [DevOps] |
| [ ] | `E2bSandboxProvider` | Full interface | [Backend] |
| [ ] | Pipeline E2B branch | try/finally kill | [Backend] |
| [ ] | Credit check before enqueue | | [Backend] |
| [ ] | `DEPLOY_MAX_CONCURRENT=2` | | [Backend] |
| [ ] | Creation rate limiter 1/s | BullMQ | [Backend] |
| [ ] | `e2b-cleanup.sh` cron | | [DevOps] |
| [ ] | Integration test with mock provider | CI default | [Backend] |
| [ ] | Manual E2B test script | `scripts/e2b-smoke.ts` | [Backend] |
| [ ] | Log `sandbox_seconds` per job | | [Backend] |
| [ ] | Block deploy when credits low | | [Backend] |

### Phase 5 — Move publish + AppRegistry + Explorer

| Status | Task | Owner |
| ------ | ---- | ----- |
| [ ] | Move templates in `packages/move/templates/` | [Move] |
| [ ] | Publish via agent wallet (may use short E2B or backend CLI on worker) | [Backend] |
| [ ] | `register_app` tool + onchain tx | [Backend] |
| [ ] | `GET /api/v1/apps` | [Backend] |
| [ ] | Explorer pages use API | [Client] |
| [ ] | Project page “Launch to explorer” | [Client] |

### Phase 6 — Self-hosted Docker worker (when credits exhausted or scale)

| Status | Task | Owner |
| ------ | ---- | ----- |
| [ ] | `DockerSandboxProvider` | [Backend] |
| [ ] | Same scaffold Dockerfile as E2B | [DevOps] |
| [ ] | Fly.io / Railway worker | [DevOps] |
| [ ] | Switch `SANDBOX_PROVIDER=docker` in prod | [DevOps] |

### Phase 7 — Hardening

| Status | Task | Owner |
| ------ | ---- | ----- |
| [ ] | SSE or WS deploy progress | [Both] |
| [ ] | E2B lifecycle webhooks | [Backend] |
| [ ] | Per-user deploy quotas | [Backend] |
| [ ] | Admin view: credit burn dashboard | [Backend] |
| [ ] | `POST /app/:id/call` stub | [Backend] |
| [ ] | Update README | [Docs] |

---

## Testing matrix

| Test | Type | E2B credits? |
| ---- | ---- | ------------ |
| Path allowlist rejects `../etc/passwd` | unit | No |
| 512 KB limit enforced | unit | No |
| `MockSandboxProvider` pipeline | unit | No |
| `kill()` called on pipeline success | unit | No |
| `kill()` called on pipeline failure | unit | No |
| Template-only deploy (none provider) | integration | No |
| Projects API auth scoping | integration | No |
| E2B smoke (manual) | manual | **Yes — budget** |
| Full custom deploy E2B | manual staging | **Yes — budget** |
| Explorer public filter | integration | No |

**CI rule:** Never run real E2B in GitHub Actions on every PR — use `SANDBOX_PROVIDER=mock` (in-memory; see [Production picker](#production-picker--what-to-use-where)).

---

## Troubleshooting runbook (Hobby)

| Symptom | Likely cause | Fix |
| ------- | ------------ | --- |
| Credits draining fast | Sandboxes not killed | Add `finally`; run cleanup script |
| `RateLimitError` | Creating sandboxes >1/sec | BullMQ limiter |
| Build timeout at 60s | Default command timeout | Set `timeoutMs: 300_000` |
| OOM during build | 512 MB sandbox RAM | Use 2048 MB; template build 4096 MB |
| Disk full | `node_modules` too big + copy | Shrink deps; one copy only |
| Deploy stuck `running` | Worker crashed mid-job | Sweeper kills sandbox; mark job failed |
| Preview blank | Bad JSX in artifact | Error boundary; validate TS optionally |
| Walrus upload fails | Wrong publisher URL | Check env + CLI version in template |

---

## Dependency graph

```text
Phase 1 (artifacts, $0)
    └── Phase 2 (build preview, $0)
            └── Phase 3 (template Walrus, $0) ← FIRST REAL LINKS
                    └── Phase 4 (E2B custom — Hobby credits)
                            └── Phase 5 (Move + explorer)
                                    └── Phase 6 (Docker worker)
                                            └── Phase 7 (hardening)
```

**Recommended order for free tier:** Phase **1 → 2 → 3** before spending E2B credits. Phase 4 only when users need **custom** codegen beyond fixed templates.

---

## Quick reference: Hobby plan do / don't

| ✅ Do | ❌ Don't |
| ----- | -------- |
| Preview in browser iframe | Spin E2B for preview |
| Template-only Walrus deploy first | Default all deploys to E2B |
| Preinstall deps in template | `pnpm install` per deploy |
| `kill()` in `finally` | Rely on timeout to stop billing |
| `DEPLOY_MAX_CONCURRENT=2` | Use 20 concurrent on Hobby |
| Fixed templates → `SANDBOX_PROVIDER=none` | Run E2B for escrow/swap templates |
| Monitor credit balance | Unlimited manual E2B testing |
| Mock provider in CI (`SANDBOX_PROVIDER=mock`) | Real E2B in every PR |
| Read [Production picker](#production-picker--what-to-use-where) before env changes | Ship `mock` or in-memory code without documenting it |

---

## Link to backend master TODO

Tracked as **Phase 11** in [backend/docs/TODO.md](../backend/docs/TODO.md).
