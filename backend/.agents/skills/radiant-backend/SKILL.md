---
name: radiant-backend
description: >-
  Implements and maintains the Radiant Node.js backend under backend/. Enforces
  layered architecture (api → services → infrastructure), strict TypeScript (no
  any), Prisma migrate workflow, Privy agent-wallet auth, and API response
  envelope. Use when editing backend/, adding routes, services, Prisma schema,
  workers, WebSocket handlers, or backend tests.
---

# Radiant Backend

Read [backend/README.md](../../../README.md), [api-ref.md](../../../api-ref.md), and [privy-implementation-plan.md](../../../docs/privy-implementation-plan.md) first.

Layer placement details: [layers.md](layers.md).

**Privy (mandatory):** HttpOnly cookie sessions (`privy-token`) — not custom JWT. Embedded **Sui** agent wallets via Privy; server signs with **session signers** (authorization key). Never server-derived wallets. **Shared state:** one `privy_user_id` → one `User` → one agent wallet (GitHub, Google, email OTP with same email). **`email` is `@unique`** (normalize before write). Email auth is OTP two-step (`sendCode` / `loginWithCode`). See implementation plan for Tool 1 (auth) and Tool 2 (agent wallet).

---

## Architecture rule

**HTTP → services → infrastructure.** Never skip layers.

| Layer | Path | Allowed |
| ----- | ---- | ------- |
| Entry | `src/main.ts`, `src/app.ts` | Wire server, middleware, routes, workers — no business logic |
| HTTP | `src/api/` | Parse/validate request, call one service, map response |
| Business | `src/services/<domain>/` | Domain logic, orchestration, repository **interfaces** |
| I/O | `src/infrastructure/` | Prisma client, Redis, external SDK clients |
| Cross-cutting | `src/config/`, `src/shared/`, `src/utils/`, `src/types/` | Env, logger, HTTP envelope, shared types |
| Async | `src/workers/`, `src/websocket/` | Queue consumers, Socket.IO — delegate to services |

**Forbidden placements**

- No Prisma/`$queryRaw` in `src/api/` or route handlers
- No chain SDK imports (Sui, viem, etc.) in `src/api/` — use `src/services/chains/`
- No Claude/E2B/Walrus calls in route files — use `src/services/agent/`, `sandbox/`, `walrus/`
- No `any` anywhere (see TypeScript section)

---

## TypeScript (strict — no `any`)

`tsconfig.json` has `strict: true`. Treat these as errors:

| Rule | Do instead |
| ---- | ---------- |
| `any` | `unknown` + narrow with `zod`, type guards, or generics |
| `as any` | Fix the type or add a proper type predicate |
| `@ts-ignore` / `@ts-expect-error` | Fix root cause; only allow with a one-line justification comment |
| Implicit `any` on params | Explicit parameter and return types on exported functions |
| `// eslint-disable` for types | Resolve the typing issue |

**Patterns**

```typescript
// External/JSON input — always validate
const body = chatRequestSchema.parse(req.body);

// Errors — narrow unknown
function toMessage(err: unknown): string {
  return err instanceof Error ? err.message : "Unknown error";
}

// Prisma results — use generated types; don't cast to any
import type { User } from "@prisma/client";
```

**Unused code**: delete it. Do not add `// unused` or `@ts-unused` suppressions unless the export is a deliberate public API stub (rare).

---

## Prisma migrations (mandatory workflow)

Never hand-edit files under `prisma/migrations/` after they have been applied anywhere.

### Development (schema change)

```bash
cd backend
# 1. Edit prisma/schema.prisma only
# 2. Create migration
npx prisma migrate dev --name <snake_case_description>
# 3. Client is regenerated automatically; if not:
npx prisma generate
```

Use descriptive names: `add_user_privy_id`, `create_app_registry_index`.

### Production / CI

```bash
npx prisma migrate deploy
npx prisma generate
```

`npm run db:deploy` in `package.json` should wrap `migrate deploy` + `generate` — not `db push`.

### Rules

| ✅ Do | ❌ Don't |
| ----- | -------- |
| Add a **new** migration for every schema change | Edit an already-applied migration SQL file |
| Use `migrate dev` locally | Use `prisma db push` for shared/staging/prod schema |
| Keep `schema.prisma` as single source of truth | Put raw DDL in route handlers or scripts |
| Add indexes/FKs in the migration | Duplicate business tables outside Prisma when avoidable |

`prisma db push` is allowed **only** for a throwaway local DB with no migration history — never commit relying on push alone.

### Data backfills

One-off data fixes go in `scripts/` (e.g. `scripts/backfill-agent-wallets.ts`), not inside route handlers. Document the script in a migration comment or `scripts/` header.

---

## API conventions

- **Versioned paths only**: `/api/v1/...` (see `api-ref.md`). Unversioned: `GET /health` only.
- **Response envelope** (match Arcane / Yuki style):

```typescript
{ success, data, meta: { correlation_id, timestamp, pagination? }, error }
```

Use helpers in `src/utils/http-response.ts` (`ok`, `fail`). Never invent per-route JSON shapes.

- **Validation**: Zod schemas in the route module or `src/services/<domain>/*.types.ts`; parse before calling services.
- **Auth**: Privy token verification in middleware → attach `userId` + **Privy-generated agent wallet address** to `req`. Wallet creation stays in Privy; backend only verifies and resolves.
- **Errors**: Map service errors to `error.code` + HTTP status in the route; never leak stack traces or Prisma messages in production.

---

## Service module pattern

Each domain under `src/services/<name>/`:

```
<name>/
├── <name>.service.ts      # Public service API
├── <name>.repository.ts    # DB access (uses infrastructure/postgres)
├── <name>.types.ts        # Domain types + Zod schemas
└── index.ts               # Re-exports (optional)
```

- **`.service.ts`**: orchestration, calls repositories and other services
- **`.repository.ts`**: Prisma queries only — import `prisma` from `src/infrastructure/postgres/client`
- Cross-domain: service A calls service B — never repository-to-repository across domains

---

## Domain → folder map (Radiant)

| Feature | Service folder | Route folder |
| ------- | -------------- | ------------ |
| Privy auth / session | `services/auth/` | `api/routes/v1/auth/` |
| Agent Sui wallet | `services/wallet/` | (used by middleware + other routes) |
| Claude + tools | `services/agent/` | `api/routes/v1/chat/` |
| Build preview | `services/agent/` or `services/deploy/` | `api/routes/v1/build/` |
| Deploy pipeline | `services/deploy/`, `sandbox/`, `walrus/` | `api/routes/v1/deploy/` |
| Explorer listings | `services/deploy/` or dedicated registry service | `api/routes/v1/apps/` |
| App proxy/call | `services/deploy/` | `api/routes/v1/app/` |
| Chain reads/tx | `services/chains/` | via agent tools, not direct SDK in routes |
| Walrus memory/creds | `services/memory/`, `services/walrus/` | internal to chat/deploy |
| Background deploy | `workers/` | triggered from `services/deploy/` |

Move contracts live in `packages/move/` — not `backend/contracts/` (reference only).

---

## Config & secrets

- Read env in `src/config/env.ts` once; export typed getters. No scattered `process.env.FOO` in services.
- Secrets only in `.env` — never commit. Mirror new vars in `.env.example` with empty placeholders.
- `CORS_ORIGIN`, `PRIVY_APP_ID`, `PRIVY_APP_SECRET`, `DATABASE_URL` required for auth flows.

---

## Security guards

When adding auth, outbound HTTP, proxy, or data-export code:

- **Cookie auth** — protect routes with `requireAuth`; validate CSRF via `csrfOriginMiddleware` on state-changing requests; never store tokens or secrets in client storage.
- **Outbound fetch** (proxy, `call_api`, agent tools) — use `services/proxy/ssrf-guard.ts` (`validateOutboundUrl`, `fetchWithSsrfGuard`); manual redirects with SSRF re-validation on every hop; no `redirect: "follow"`.
- **Proxy headers** — strip `Authorization`, `Cookie`, `X-Api-Key`, `Proxy-Authorization` unless hostname matches `PROXY_SECRET_HEADER_ALLOWLIST_HOSTS` (comma-separated exact hosts or `.suffix` patterns).
- **Sensitive routes** — apply rate limits (`auth-rate-limit.ts`); emit structured audit logs (`privyUserId`, `correlationId`, timestamp) for exports and similar PII access.
- **IDOR** — always scope queries and mutations by `req.user.privyUserId` from the verified session; never trust client-supplied user ids.

DNS rebinding (hostname validated but IP resolves to private range) is not mitigated; document if adding new outbound fetch paths.

---

## Tests

| Type | Location | Notes |
| ---- | -------- | ----- |
| Unit | `tests/unit/` | Mock repositories; no real DB |
| Integration | `tests/integration/` | Real Postgres (docker compose); gate with `RUN_INTEGRATION_TESTS=1` |
| Helpers | `tests/helpers/` | Shared fixtures, HTTP client |

Test the **service** layer; route tests only for HTTP contract (status, envelope shape).

---

## Pre-merge checklist

```bash
cd backend
npx tsc --noEmit          # zero errors
npm test                  # unit; integration if schema/routes touched
npx prisma migrate diff   # no drift vs schema (when migrations changed)
```

If you also changed `client/`, run before finishing:

```bash
cd client && npm run lint && npm run build
```

See `.cursor/rules/verify-before-complete.mdc` — do not stop until checks pass for every package you touched.

Before finishing:

- [ ] No `any`, `as any`, or unjustified `@ts-ignore`
- [ ] New code in the correct layer/folder
- [ ] Schema change has a new `prisma/migrations/*` entry (not edited old migration)
- [ ] `.env.example` updated if env vars added
- [ ] `api-ref.md` updated if public routes changed
- [ ] Privy wallet flows use `services/auth` + `services/wallet` — no local key generation
