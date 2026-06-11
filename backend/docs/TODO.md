# Radiant — Implementation TODO

Trackable checklist for Privy auth + agent wallet. Full context: [privy-implementation-plan.md](./privy-implementation-plan.md).

**Legend:** `[Dashboard]` Privy Dashboard · `[Backend]` `backend/` · `[Client]` `client/` · `[Both]`

---

## Phase 0 — Prerequisites

> Do first. Blocks everything else.

### 0.1 Infrastructure

| Status | Task | Owner |
| ------ | ---- | ----- |
| [x] | `cp backend/.env.example backend/.env` and fill values | [Backend] |
| [x] | `docker compose up -d` (Postgres 5435, Redis 6380, RabbitMQ) | [Backend] |
| [x] | `npm install` in `backend/` | [Backend] |
| [x] | Add deps: `express`, `cookie-parser`, `cors`, `zod`, `@privy-io/node`, `@prisma/client`, `winston` | [Backend] |
| [x] | Add dev deps: `prisma`, `tsx`, `typescript`, `@types/*` | [Backend] |
| [x] | `src/main.ts` + `src/app.ts` — Express boot, `GET /health` | [Backend] |
| [x] | `src/shared/logger.ts` + `src/utils/http-response.ts` (`ok`, `fail`) | [Backend] |
| [x] | `src/infrastructure/postgres/client.ts` — Prisma singleton | [Backend] |

### 0.2 Privy Dashboard (dev app)

| Status | Task | Owner |
| ------ | ---- | ----- |
| [ ] | Create **development** Privy app | [Dashboard] |
| [ ] | Enable login methods: **Google**, **GitHub**, **Email (OTP)** — no password | [Dashboard] |
| [ ] | Enable **Login method transfer** (same-email merges) | [Dashboard] |
| [ ] | Enable **Return user data in identity token** | [Dashboard] |
| [x] | Copy `PRIVY_APP_ID` + `PRIVY_APP_SECRET` → `backend/.env` | [Dashboard] |
| [x] | Copy `NEXT_PUBLIC_PRIVY_APP_ID` → `client/.env.local` | [Dashboard] |

### 0.3 Client env

| Status | Task | Owner |
| ------ | ---- | ----- |
| [x] | `npm install @privy-io/react-auth` in `client/` | [Client] |
| [x] | `client/.env.local` with `NEXT_PUBLIC_PRIVY_APP_ID`, `NEXT_PUBLIC_API_URL=http://localhost:3001` | [Client] |

**Exit criteria:** `curl localhost:3001/health` OK · Docker services healthy · Privy dev app configured.

---

## Phase 1 — Tool 1: Cookie session auth (Backend)

> Depends on Phase 0. No agent wallet yet.

### 1.1 Database

| Status | Task | Owner |
| ------ | ---- | ----- |
| [x] | `prisma/schema.prisma` — `User` (`privy_user_id` @unique, `email` @unique) | [Backend] |
| [x] | `npx prisma migrate dev --name add_user` | [Backend] |
| [x] | `src/utils/normalize-email.ts` — trim + lowercase | [Backend] |

### 1.2 Privy + auth layer

| Status | Task | Owner |
| ------ | ---- | ----- |
| [x] | `src/config/env.ts` — Zod validate `PRIVY_APP_ID`, `PRIVY_APP_SECRET`, `CORS_ORIGIN`, `DATABASE_URL` | [Backend] |
| [x] | `src/config/cors.ts` — `credentials: true`, origin from env | [Backend] |
| [x] | `src/infrastructure/privy/client.ts` — `PrivyClient` singleton | [Backend] |
| [x] | `src/services/auth/auth.types.ts` — `AuthenticatedUser`, Zod schemas | [Backend] |
| [x] | `src/services/auth/privy-auth.service.ts` — `verifyAccessToken`, `fetchPrivyUser` | [Backend] |
| [x] | `src/services/auth/user.repository.ts` — upsert by `privy_user_id`, email conflict → 409 | [Backend] |
| [x] | `src/services/auth/user.service.ts` — `getOrCreateUser`, merge conflict handling | [Backend] |

### 1.3 HTTP layer

| Status | Task | Owner |
| ------ | ---- | ----- |
| [x] | `src/api/middleware/correlation-id.ts` | [Backend] |
| [x] | `src/api/middleware/request-logger.ts` | [Backend] |
| [x] | `src/api/middleware/error-handler.ts` — standard envelope | [Backend] |
| [x] | `src/api/middleware/auth.ts` — read `privy-token` cookie → `req.user` | [Backend] |
| [x] | `src/types/express.d.ts` — augment `Request` with `user`, `correlationId` | [Backend] |
| [x] | `src/api/routes/health.ts` | [Backend] |
| [x] | `src/api/routes/v1/auth/me.ts` — `GET /api/v1/auth/me` | [Backend] |
| [x] | `src/api/routes/v1/auth/logout.ts` — `POST /api/v1/auth/logout` | [Backend] |
| [x] | Wire routes in `src/app.ts` (`cookie-parser`, CORS, middleware) | [Backend] |

### 1.4 Tests

| Status | Task | Owner |
| ------ | ---- | ----- |
| [x] | `tests/unit/normalize-email.test.ts` | [Backend] |
| [x] | `tests/unit/auth-middleware.test.ts` — missing cookie → 401 | [Backend] |
| [x] | `tests/integration/auth-me.test.ts` — mock Privy verify | [Backend] |

**Exit criteria:** Authenticated request with valid `privy-token` returns `/auth/me` with user row in Postgres.

---

## Phase 2 — Client: Privy login (whitelabel)

> Depends on Phase 0 Dashboard. Can run parallel with Phase 1.

### 2.1 Provider setup

| Status | Task | Owner |
| ------ | ---- | ----- |
| [ ] | `PrivyProvider` in `client/src/app/layout.tsx` or dedicated provider | [Client] |
| [ ] | Configure login methods: Google, GitHub, email only | [Client] |
| [ ] | Dev: localStorage cookies OK for localhost (Privy dev app) | [Client] |

### 2.2 AuthCard — OAuth

| Status | Task | Owner |
| ------ | ---- | ----- |
| [ ] | Wire **Google** → `useLoginWithOAuth` → `initOAuth({ provider: 'google' })` | [Client] |
| [ ] | Wire **GitHub** → `initOAuth({ provider: 'github' })` | [Client] |
| [ ] | Remove mock `router.push('/app')` — call Privy then redirect on success | [Client] |
| [ ] | `onComplete` callback: call `GET /api/v1/auth/me` (credentials: include) | [Client] |

### 2.3 AuthCard — Email OTP (two-step)

| Status | Task | Owner |
| ------ | ---- | ----- |
| [ ] | Step 1: email input → `sendCode({ email })` | [Client] |
| [ ] | Step 2: OTP input → `loginWithCode({ email, code })` | [Client] |
| [ ] | UI states: idle → code sent → verifying → error | [Client] |
| [ ] | Same `onComplete` → `/auth/me` as OAuth | [Client] |

### 2.4 API client

| Status | Task | Owner |
| ------ | ---- | ----- |
| [ ] | `client/src/lib/api.ts` — `fetch` wrapper with `credentials: 'include'` | [Client] |
| [ ] | Point at `NEXT_PUBLIC_API_URL` | [Client] |

**Exit criteria:** Real Google/GitHub/email login sets Privy session · `/auth/me` returns user from backend.

---

## Phase 3 — Tool 2: Agent wallet (Backend + Client)

> Depends on Phase 1 + Phase 2 (user can authenticate).

### 3.1 Privy Dashboard (signers)

| Status | Task | Owner |
| ------ | ---- | ----- |
| [ ] | Generate P-256 authorization keypair | [Dashboard] |
| [ ] | Register public key → key quorum (threshold 1) | [Dashboard] |
| [ ] | Optional: create Sui policy (transfer limits, allowlisted commands) | [Dashboard] |
| [ ] | `PRIVY_AUTHORIZATION_PRIVATE_KEY` → `backend/.env` | [Dashboard] |
| [ ] | `PRIVY_SIGNER_QUORUM_ID` → backend + `NEXT_PUBLIC_*` client | [Dashboard] |

### 3.2 Database

| Status | Task | Owner |
| ------ | ---- | ----- |
| [ ] | Add `AgentWallet` model to `schema.prisma` | [Backend] |
| [ ] | `npx prisma migrate dev --name add_agent_wallet` | [Backend] |

### 3.3 Backend wallet services

| Status | Task | Owner |
| ------ | ---- | ----- |
| [ ] | `src/config/privy.ts` — signer quorum, policy IDs | [Backend] |
| [ ] | `src/services/wallet/agent-wallet.repository.ts` | [Backend] |
| [ ] | `src/services/wallet/agent-wallet.service.ts` — resolve by `privyUserId` | [Backend] |
| [ ] | `src/api/routes/v1/auth/register-wallet.ts` — `POST /api/v1/auth/register-wallet` | [Backend] |
| [ ] | Extend `GET /auth/me` to include `agent_wallet` + `funded` flag | [Backend] |
| [ ] | `src/services/wallet/balance.service.ts` — Sui RPC balance | [Backend] |
| [ ] | `src/api/routes/v1/wallets/balances.ts` — `GET /api/v1/wallets/balances` | [Backend] |

### 3.4 Client wallet onboarding

| Status | Task | Owner |
| ------ | ---- | ----- |
| [ ] | After first login (`isNewUser`): `useCreateWallet({ chainType: 'sui' })` | [Client] |
| [ ] | `POST /auth/register-wallet` with `{ privy_wallet_id, sui_address }` | [Client] |
| [ ] | `useSigners` → `addSigners` with quorum ID (+ policy if set) | [Client] |
| [ ] | Update `AgentWalletSection` in settings to show real address/balance | [Client] |

### 3.5 Signing (agent can transact)

| Status | Task | Owner |
| ------ | ---- | ----- |
| [ ] | `src/services/wallet/sui-signing.service.ts` — Privy `rawSign` / Sui bytes | [Backend] |
| [ ] | `src/services/wallet/sui-transaction.service.ts` — broadcast via `@mysten/sui` | [Backend] |
| [ ] | `src/services/chains/adapters/sui.ts` — `getBalance`, `executeTransaction` | [Backend] |
| [ ] | `npm install @mysten/sui` | [Backend] |

### 3.6 Tests

| Status | Task | Owner |
| ------ | ---- | ----- |
| [ ] | `tests/unit/agent-wallet.service.test.ts` | [Backend] |
| [ ] | `tests/integration/register-wallet.test.ts` | [Backend] |

**Exit criteria:** New user gets Sui wallet · signer added · `/wallets/balances` returns SUI balance.

---

## Phase 4 — Shared identity (cross-cutting)

> Depends on Phase 1–3. Ensures GitHub → Gmail → email OTP = same user.

| Status | Task | Owner |
| ------ | ---- | ----- |
| [ ] | `/auth/me` upsert: email `@unique`, normalize before write | [Backend] |
| [ ] | Return `409 ACCOUNT_MERGE_REQUIRED` on email conflict across DIDs | [Backend] |
| [ ] | Client: handle `linked_to_another_user` — show merge prompt | [Client] |
| [ ] | Settings: **Connected accounts** with `useLinkAccount` (Google, GitHub, email) | [Client] |
| [ ] | Webhook route `POST /api/v1/webhooks/privy` — verify signature | [Backend] |
| [ ] | Handle `user.transferred_account` — delete orphan `User`, keep wallet on survivor | [Backend] |
| [ ] | Handle `user.linked_account` — refresh linked methods on `User` | [Backend] |

**Exit criteria:** Same email via two providers → one `User` row · one `AgentWallet` after merge.

---

## Phase 5 — Agent integration

> Depends on Phase 3 signing. Chat/deploy come later.

| Status | Task | Owner |
| ------ | ---- | ----- |
| [ ] | `execute_transaction` tool — no `wallet` in input; resolve from session | [Backend] |
| [ ] | User approval modal for txs above threshold | [Client] |
| [ ] | Remove `wallet` / `wallet_address` from `api-ref.md` request examples | [Backend] |
| [ ] | `POST /api/v1/chat` — Claude + tools (stub OK first) | [Backend] |

---

## Phase 6 — Production hardening

> After dev flow works end-to-end.

### 6.1 Production Privy app

| Status | Task | Owner |
| ------ | ---- | ----- |
| [ ] | Create **production** Privy app (separate from dev) | [Dashboard] |
| [ ] | Enable HttpOnly cookies + verify production domain DNS | [Dashboard] |
| [ ] | Production env vars on host | [Both] |

### 6.2 Cookie refresh (SSR)

| Status | Task | Owner |
| ------ | ---- | ----- |
| [ ] | `client/src/app/refresh/page.tsx` — `getAccessToken()` + redirect | [Client] |
| [ ] | Next.js middleware: `privy-session` without `privy-token` → `/refresh` | [Client] |
| [ ] | Skip redirect on `privy_oauth_*` query params | [Client] |

### 6.3 Deploy checklist

| Status | Task | Owner |
| ------ | ---- | ----- |
| [ ] | `npm run db:deploy` on production Postgres | [Backend] |
| [ ] | `CORS_ORIGIN` = production frontend URL | [Backend] |
| [ ] | No secrets in logs; `PRIVY_AUTHORIZATION_PRIVATE_KEY` server-only | [Backend] |
| [ ] | `npx tsc --noEmit` + tests pass | [Backend] |

---

## Dependency graph

```
Phase 0 (infra + dashboard)
    ├── Phase 1 (backend auth) ──────┐
    └── Phase 2 (client login) ────────┤
                                       ▼
                              Phase 3 (agent wallet)
                                       │
                    ┌──────────────────┼──────────────────┐
                    ▼                  ▼                  ▼
              Phase 4            Phase 5            Phase 6
           (shared identity)   (agent tools)    (production)
```

---

## Quick reference: who builds what

| Concern | Backend | Client | Dashboard |
| ------- | ------- | ------ | --------- |
| Login UI | — | ✅ | — |
| Session cookie verify | ✅ | — | — |
| User row in Postgres | ✅ | — | — |
| Sui wallet create | — | ✅ | — |
| Session signer | — | ✅ `addSigners` | ✅ auth key |
| Sign transactions | ✅ | — | ✅ policies |
| Email unique constraint | ✅ | — | — |
| Login method transfer | — | ✅ UX | ✅ enable |
