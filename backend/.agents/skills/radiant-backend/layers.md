# Radiant Backend — Layer Placement Guide

Quick reference for where code belongs. When unsure, default to **services** and expose via **api**.

---

## `src/api/`

**Routes** (`api/routes/v1/<resource>/`)

- Parse `req` (params, query, body) with Zod
- Read `req.user` / agent wallet from auth middleware
- Call exactly one service method (or a thin orchestration already in a service)
- Return `ok()` / `fail()` with correct HTTP status

**Middleware** (`api/middleware/`)

- `correlation-id.ts` — assign `req.correlationId`
- `request-logger.ts` — structured request/response logs
- `auth.ts` — verify Privy token; attach user + agent wallet
- `error-handler.ts` — catch unhandled errors; envelope 500
- `rate-limit.ts` — Redis-backed limits (when added)

---

## `src/services/`

| Module | Responsibility | Must NOT |
| ------ | -------------- | -------- |
| `auth/` | Privy JWT verification, user lookup/upsert | Store private keys; create wallets locally |
| `wallet/` | Resolve agent Sui address; request Privy signing | Expose keys to logs or responses |
| `agent/` | Claude client, tool definitions, tool dispatch | Import Express types |
| `chains/` | `ChainAdapter`, registry, `adapters/sui.ts` etc. | Be imported from `api/` directly — go through agent or a facade |
| `memory/` | Load/save agent memory blobs (Walrus) | SQL for long-term memory (Walrus is source of truth) |
| `walrus/` | Blob store/fetch, Sites deploy helpers | HTTP route handlers |
| `sandbox/` | E2B spawn, exec, teardown | Long-running loops in request path |
| `deploy/` | Orchestrate build → E2B → Walrus → registry | Inline in chat route |

---

## `src/infrastructure/`

| Module | Responsibility |
| ------ | -------------- |
| `postgres/client.ts` | Singleton `PrismaClient`, connect/disconnect |
| `redis/client.ts` | ioredis connection for BullMQ + cache |

Only repositories and workers import infrastructure clients directly. Services use repositories.

---

## `src/workers/`

- BullMQ job processors (e.g. `deploy-pipeline.worker.ts`)
- Import services; never duplicate deploy logic from `services/deploy/`

---

## `src/websocket/`

- Socket.IO setup, room auth (Privy session)
- Emit events; heavy work goes to workers/services

---

## `src/config/`

- `env.ts` — Zod-validated env object
- `cors.ts`, `sui.ts`, `walrus.ts` — static config from env

---

## `src/shared/`

- `logger.ts` — Winston (or equivalent) with correlation ID support
- `errors.ts` — `AppError` with `code`, `status`, `details?`

---

## `src/utils/`

- Pure helpers: `http-response.ts`, session parsing, token formatting
- No DB, no HTTP server imports

---

## `src/types/`

- Express augmentation (`express.d.ts` for `correlationId`, `user`)
- Shared API DTOs not tied to one domain

---

## `scripts/` vs `prisma/migrations/`

| Use | Location |
| --- | -------- |
| Schema DDL | `prisma migrate dev` → `prisma/migrations/` |
| One-off data backfill | `scripts/backfill-*.ts` |
| Smoke / dev tools | `scripts/smoke-*.ts` |
| DB health check | `scripts/check-db-schema.ts` |

---

## Anti-patterns (reject in review)

```typescript
// ❌ Route doing Prisma
router.post("/chat", async (req, res) => {
  const user = await prisma.user.findUnique(...);
});

// ✅ Route delegates
router.post("/chat", async (req, res) => {
  const reply = await chatService.handleMessage(req.user!, parsed.body);
  return ok(req, res, reply);
});
```

```typescript
// ❌ any
const data: any = await fetchChain();

// ✅ typed adapter
const balance = await getAdapter("sui:mainnet").getBalance(address);
```

```typescript
// ❌ editing applied migration
// prisma/migrations/20240101_init/migration.sql  (already deployed — DO NOT EDIT)

// ✅ new migration
// npx prisma migrate dev --name add_wallet_address_index
```
