---
name: inngest-radiant
description: >-
  Radiant-specific Inngest integration — deploy pipeline queue, Express serve
  endpoint, env vars, and local dev. Use with upstream skills in
  backend/.agents/skills/inngest/ (from https://github.com/inngest/inngest-skills).
---

# Inngest in Radiant

Radiant uses [Inngest](https://www.inngest.com/) for **durable deploy jobs** (E2B build → Walrus upload). REST APIs stay on Express — no tRPC.

## Upstream skills

Load these from `backend/.agents/skills/inngest/` (vendored from [inngest/inngest-skills](https://github.com/inngest/inngest-skills)):

| Skill | When |
| ----- | ---- |
| `inngest-setup` | SDK install, env, Express serve, dev server |
| `inngest-durable-functions` | Function config, retries, concurrency |
| `inngest-steps` | `step.run`, sleeps, waits |
| `inngest-events` | Event naming, idempotency |
| `inngest-flow-control` | Rate limits, concurrency tuning |
| `inngest-cli` | Local `inngest-cli dev` |

Full docs index: https://www.inngest.com/llms.txt

## Layout

```
backend/src/
├── config/inngest.ts              # env + queue provider selection
├── inngest/
│   ├── client.ts                  # Inngest app id: radiant-backend
│   ├── events.ts                  # radiant/deploy.requested
│   └── functions/deploy-pipeline.ts
├── infrastructure/inngest/enqueue-deploy.ts
└── infrastructure/redis/queues.ts # BullMQ fallback when Inngest off
```

## Flow

```
POST /api/v1/deploy  →  createDeployJob  →  enqueueDeployJob()
                                              ├─ Inngest (default when configured)
                                              └─ BullMQ / in-process fallback
Inngest  →  POST /api/inngest  →  deploy-app-pipeline  →  runDeployPipeline(jobId)
```

## Environment

```env
# Local dev (Inngest Dev Server — no cloud keys required)
INNGEST_DEV=1

# Production / cloud (from Inngest dashboard)
INNGEST_EVENT_KEY=
INNGEST_SIGNING_KEY=

# Optional
INNGEST_APP_ID=radiant-backend
INNGEST_BASE_URL=http://localhost:8288
DEPLOY_QUEUE_PROVIDER=auto   # auto | inngest | bullmq
```

**`auto` (default):** use Inngest when `INNGEST_DEV=1` or both keys are set; otherwise BullMQ.

## Local development

Terminal 1 — API (with dev mode):

```bash
cd backend
INNGEST_DEV=1 npm run dev
```

Terminal 2 — Inngest Dev Server:

```bash
cd backend
npm run inngest:dev
```

Open http://localhost:8288 for runs, traces, and manual invokes.

## Rules

- Keep `runDeployPipeline` in `services/deploy/pipeline.ts` — Inngest function only wraps it in `step.run`.
- Mount serve at **`/api/inngest`** only when `getInngestConfig().enabled`.
- Use event id `deploy-${jobId}` on send for idempotency.
- Do not hardcode `isDev: true` on the client — use `INNGEST_DEV=1`.
