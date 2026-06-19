# Radiant Backend

Infrastructure and folder layout for the Node.js API — same layered architecture as the Arcane `backend/` project (`api/` → `services/` → `infrastructure/`). Implementation lives under `src/` — not started yet.

API and protocol reference: [api-ref.md](./api-ref.md).

**Privy implementation plan (auth + agent wallet):** [docs/privy-implementation-plan.md](./docs/privy-implementation-plan.md) — architecture and API contracts.

**Implementation TODO (phases 0–6):** [docs/TODO.md](./docs/TODO.md) — granular checklist with `[Backend]` / `[Client]` / `[Dashboard]` owners.

**Agent skill (required for all backend work):** [.agents/skills/radiant-backend/SKILL.md](./.agents/skills/radiant-backend/SKILL.md) — layered architecture, no `any`, Prisma migrate workflow, folder placement.

## Docker Compose (Postgres, Redis, RabbitMQ)

From this directory:

```bash
cp .env.example .env
npm install
docker compose up -d
docker compose ps
docker compose logs -f
docker compose down
```

| Service  | Port(s)       | Role |
| -------- | ------------- | ---- |
| Postgres | 5435 (host)   | Prisma — users, sessions, registry index |
| Redis    | 6380          | BullMQ, rate limits, WebSocket coordination |
| RabbitMQ | 5673, 15673   | Async messaging (management UI on 15673) |

Images are built from `docker/postgres`, `docker/redis`, and `docker/rabbitmq`.

## Docker API (production)

Build and run the backend API in a container (migrations run on boot):

```bash
docker build -t radiant-backend .
docker run --env-file .env -p 3001:3001 radiant-backend
```

Full local stack (Postgres + Redis + RabbitMQ + API):

```bash
docker compose --profile app up -d --build
```

Fill secrets in `.env` (Privy, OpenAI, Inngest, etc.); compose overrides `DATABASE_URL` / `REDIS_URL` / `RABBITMQ_URL` to internal service names. See [`.env.docker.example`](./.env.docker.example) and [docs/deploy-checklist.md](./docs/deploy-checklist.md).

## Agent wallet (Privy)

Radiant uses **[Privy](https://docs.privy.io/)** to **generate** each user's **agent Sui wallet** on signup (Google, GitHub, or email). Privy provisions an embedded Sui wallet tied to the account and holds signing keys in Privy's secure enclave. Radiant never stores private keys.

| Concern | Layer |
| -------- | ----- |
| Wallet creation on signup | Privy (frontend + Privy API) |
| Token verification | `src/services/auth/` |
| Agent wallet address lookup | `src/services/auth/` + `src/services/wallet/` |
| Transaction signing (after user approval) | Privy server-side signing via backend |
| Optional deposit from personal wallet | Frontend only (`@mysten/dapp-kit`) |

## Folder structure

Mirrors Arcane's layered layout; Radiant-specific services replace Somnia/QuickSwap modules.

```
backend/
├── api-ref.md              # API routes & env checklist
├── docker-compose.yml
├── .env.example
├── package.json
├── tsconfig.json
├── docker/
│   ├── postgres/
│   ├── redis/
│   └── rabbitmq/
├── prisma/                 # Schema & migrations (future)
├── scripts/                # Smoke tests, DB helpers
├── tests/
│   ├── helpers/
│   ├── integration/
│   └── unit/
├── contracts/              # Symlink or reference to ../packages/move (future)
└── src/
    ├── main.ts             # Server entry (planned)
    ├── app.ts              # Express/Hono app factory (planned)
    ├── api/                # HTTP layer
    │   ├── middleware/     # auth, correlation-id, error-handler, rate-limit
    │   └── routes/
    │       ├── health.ts
    │       └── v1/
    │           ├── auth/     # Privy session / me
    │           ├── chat/     # POST /chat
    │           ├── build/    # POST /build
    │           ├── deploy/   # POST /deploy
    │           ├── apps/     # GET /apps (explorer)
    │           └── app/      # POST /app/:id/call
    ├── workers/            # BullMQ — deploy pipeline, background jobs
    ├── websocket/          # Socket.IO — chat stream, deploy progress
    ├── services/
    │   ├── auth/           # Privy verification
    │   ├── wallet/         # Agent wallet resolution & signing
    │   ├── agent/          # Claude client, tools, templates
    │   ├── chains/         # ChainAdapter + adapters (sui, evm, solana)
    │   ├── memory/         # Agent memory + credentials (Walrus blobs)
    │   ├── sandbox/        # E2B client
    │   ├── walrus/         # Walrus Sites + blob store
    │   └── deploy/         # Deploy pipeline orchestration
    ├── infrastructure/
    │   ├── postgres/       # Prisma client
    │   └── redis/          # ioredis / BullMQ connection
    ├── config/             # env, cors, sui, walrus
    ├── shared/             # logger, errors
    ├── types/
    └── utils/              # http-response, session helpers
```

## Related docs

Full product architecture and deploy pipeline: [`../README.md`](../README.md).
