# Radiant — Implementation TODO

Trackable checklist for Privy auth + multi-chain agent wallets. Full context: [privy-implementation-plan.md](./privy-implementation-plan.md).

**Legend:** `[Dashboard]` Privy Dashboard · `[Backend]` `backend/` · `[Client]` `client/` · `[Both]`

### Architecture: Sui-first, multi-chain ready

Radiant is **Sui-first** for MVP, but the backend should support **EVM, Solana, and future chains** via a shared **ChainAdapter** layer — not Sui-only routes and SDK calls everywhere.

| Wallet type | Who controls it | Where it lives | Purpose |
| ----------- | --------------- | -------------- | ------- |
| **Privy embedded agent wallet** | User + server signer (Privy) | Privy + Postgres `AgentWallet` | Agent signs txs on the user's behalf |
| **Personal wallet** (Brave, MetaMask, `@mysten/dapp-kit`) | User only | Client | Optional **deposits** into the agent wallet — backend does not custody or sign |

**Adding a new chain** should mean: new `adapters/<chain>.ts` + config row + Privy `chain_type` — **not** new HTTP routes or agent-tool shapes.

```
HTTP / agent tools (chain-agnostic)
    → services/wallet/ (who owns the wallet — Privy user)
    → services/chains/registry.ts → ChainAdapter
    → infrastructure/ (Sui gRPC, viem, Solana RPC, …)
```

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
| [x] | Create **development** Privy app | [Dashboard] |
| [x] | Enable login methods: **Google**, **GitHub**, **Email (OTP)** — no password | [Dashboard] |
| [x] | Enable **Login method transfer** (same-email merges) | [Dashboard] |
| [x] | Enable **Return user data in identity token** | [Dashboard] |
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
| [x] | `PrivyProvider` in `client/src/app/layout.tsx` or dedicated provider | [Client] |
| [x] | Configure login methods: Google, GitHub, email only | [Client] |
| [x] | Dev: localStorage cookies OK for localhost (Privy dev app) | [Client] |

### 2.2 AuthCard — OAuth

| Status | Task | Owner |
| ------ | ---- | ----- |
| [x] | Wire **Google** → `useLoginWithOAuth` → `initOAuth({ provider: 'google' })` | [Client] |
| [x] | Wire **GitHub** → `initOAuth({ provider: 'github' })` | [Client] |
| [x] | Remove mock `router.push('/app')` — call Privy then redirect on success | [Client] |
| [x] | `onComplete` callback: call `GET /api/v1/auth/me` (credentials: include) | [Client] |

### 2.3 AuthCard — Email OTP (two-step)

| Status | Task | Owner |
| ------ | ---- | ----- |
| [x] | Step 1: email input → `sendCode({ email })` | [Client] |
| [x] | Step 2: OTP input → `loginWithCode({ email, code })` | [Client] |
| [x] | UI states: idle → code sent → verifying → error | [Client] |
| [x] | Same `onComplete` → `/auth/me` as OAuth | [Client] |

### 2.4 API client

| Status | Task | Owner |
| ------ | ---- | ----- |
| [x] | `client/src/lib/api.ts` — `fetch` wrapper with `credentials: 'include'` | [Client] |
| [x] | Point at `NEXT_PUBLIC_API_URL` | [Client] |

### 2.5 Logout

| Status | Task | Owner |
| ------ | ---- | ----- |
| [x] | `logoutSession()` → `POST /api/v1/auth/logout` in `auth-api.ts` | [Client] |
| [x] | `useAuthLogout` — Privy `logout()` + backend cookie clear + redirect `/auth` | [Client] |
| [x] | Log out control in sidebar footer + Settings profile | [Client] |
| [x] | `AgentWalletProvider` clears wallet state on logout | [Client] |

**Exit criteria:** Real Google/GitHub/email login sets Privy session · `/auth/me` returns user from backend · Log out clears session and returns to `/auth`.

---

## Phase 3 — Tool 2: Agent wallet — **Sui MVP** (Backend + Client)

> Depends on Phase 1 + Phase 2 (user can authenticate).  
> **Note:** Current schema and routes use `sui_address` (Sui-only). Phase **7** generalizes this for all chains.

### 3.1 Privy Dashboard (signers)

| Status | Task | Owner |
| ------ | ---- | ----- |
| [x] | Generate P-256 authorization keypair | [Dashboard] |
| [x] | Register public key → key quorum (threshold 1) | [Dashboard] |
| [ ] | Optional: create Sui policy (transfer limits, allowlisted commands) | [Dashboard] |
| [x] | `PRIVY_AUTHORIZATION_PRIVATE_KEY` → `backend/.env` | [Dashboard] |
| [x] | `PRIVY_SIGNER_QUORUM_ID` → backend + `NEXT_PUBLIC_*` client | [Dashboard] |

### 3.2 Database

| Status | Task | Owner |
| ------ | ---- | ----- |
| [x] | Add `AgentWallet` model to `schema.prisma` | [Backend] |
| [x] | `npx prisma migrate dev --name add_agent_wallet` | [Backend] |

### 3.3 Backend wallet services

| Status | Task | Owner |
| ------ | ---- | ----- |
| [x] | `src/config/privy.ts` — signer quorum, policy IDs | [Backend] |
| [x] | `src/services/wallet/agent-wallet.repository.ts` | [Backend] |
| [x] | `src/services/wallet/agent-wallet.service.ts` — resolve by `privyUserId` | [Backend] |
| [x] | `src/api/routes/v1/auth/register-wallet.ts` — `POST /api/v1/auth/register-wallet` | [Backend] |
| [x] | Extend `GET /auth/me` to include `agent_wallet` + `funded` flag | [Backend] |
| [x] | `src/services/wallet/balance.service.ts` — Sui RPC balance | [Backend] |
| [x] | `src/api/routes/v1/wallets/balances.ts` — `GET /api/v1/wallets/balances` | [Backend] |

### 3.4 Client wallet onboarding (Sui)

| Status | Task | Owner |
| ------ | ---- | ----- |
| [x] | After first login (`isNewUser`): `useCreateWallet({ chainType: 'sui' })` | [Client] |
| [x] | `POST /auth/register-wallet` with `{ privy_wallet_id, sui_address }` (generic body in Phase 7) | [Client] |
| [x] | `useSigners` → `addSigners` with quorum ID (+ policy if set) | [Client] |
| [x] | `AgentWalletSection`: real Privy agent address + balance from `/wallets/balances` | [Client] |
| [x] | Keep `@mysten/dapp-kit` for **personal** wallet deposits only (Brave / browser wallets) | [Client] |

### 3.5 Signing — Sui MVP (agent can transact)

| Status | Task | Owner |
| ------ | ---- | ----- |
| [x] | `src/services/wallet/sui-signing.service.ts` — Privy `rawSign` / Sui bytes | [Backend] |
| [x] | `src/services/wallet/sui-transaction.service.ts` — broadcast via `@mysten/sui` | [Backend] |
| [x] | `src/services/chains/adapters/sui.ts` — `getBalance`, `executeTransaction` (extract from `balance.service.ts`) | [Backend] |
| [x] | `POST /api/v1/wallets/sign-and-send` — `transfer_sui` or pre-built `transaction_bytes` | [Backend] |
| [x] | `npm install @mysten/sui` | [Backend] |

### 3.6 Tests

| Status | Task | Owner |
| ------ | ---- | ----- |
| [ ] | `tests/unit/agent-wallet.service.test.ts` | [Backend] |
| [ ] | `tests/integration/register-wallet.test.ts` | [Backend] |

**Exit criteria (Sui MVP):** New user gets Sui agent wallet · signer added · `/wallets/balances` returns SUI balance.

---

## Phase 7 — Chain abstraction layer (multi-chain foundation)

> Do **before or alongside Phase 3.5** so signing and balances are not locked to Sui-only code paths.  
> Depends on Phase 3.3 (wallet services exist).

### 7.1 Core interfaces

| Status | Task | Owner |
| ------ | ---- | ----- |
| [x] | `src/services/chains/types.ts` — `ChainId`, `ChainAdapter`, `BalanceResult`, `TxResult` | [Backend] |
| [x] | `src/services/chains/registry.ts` — `getAdapter(chainId)`, `listEnabledChains()` | [Backend] |
| [x] | `src/config/chains.ts` — enabled chains, RPC URLs, native symbols, policy IDs per chain | [Backend] |
| [x] | Agent tool contract: `execute_transaction({ chain_id, action, params })` — no chain SDK in routes | [Backend] |

### 7.2 Refactor Sui into adapter

| Status | Task | Owner |
| ------ | ---- | ----- |
| [x] | Move `balance.service.ts` + `infrastructure/sui/client.ts` logic → `adapters/sui.ts` | [Backend] |
| [x] | `wallet/balance.service.ts` becomes thin facade → `registry.getAdapter(chainId).getBalance()` | [Backend] |
| [x] | `GET /wallets/balances?chain=sui` (default chain from env) | [Backend] |
| [x] | `WalletBalanceData` — canonical `chain_id` / `balance_atomic` + legacy `sui_*` aliases | [Backend] |
| [x] | Client `fetchWalletBalances(chainId?)` optional `?chain=` | [Client] |

### 7.3 Multi-chain schema

| Status | Task | Owner |
| ------ | ---- | ----- |
| [x] | Migrate `AgentWallet`: `sui_address` → `chain_type` + `address` | [Backend] |
| [x] | `@@unique([user_id, chain_type])` — one agent wallet per chain per user | [Backend] |
| [x] | `POST /register-wallet` body: `{ chain_type, privy_wallet_id, address, signer_added? }` | [Backend] |
| [x] | `GET /auth/me` — `agent_wallets[]` + legacy `agent_wallet` (default chain) | [Backend] |
| [x] | Backfill existing Sui rows (`chain_type: 'sui'`) | [Backend] |
| [x] | Client: register with `chain_type` + `address`; read `agent_wallets` | [Client] |

### 7.4 Tests

| Status | Task | Owner |
| ------ | ---- | ----- |
| [x] | `tests/unit/chains/registry.test.ts` — unknown `chain_id` → error | [Backend] |
| [x] | `tests/unit/balance.service.test.ts` — balance facade + field mapping | [Backend] |
| [x] | `tests/unit/chains/sui.adapter.test.ts` — balance normalization | [Backend] |

**Exit criteria:** New chain = new adapter file + config only · routes and agent tools unchanged · Sui still works via registry.

---

## Phase 8 — Additional chains (EVM, Solana, …)

> Depends on Phase 7. Add chains incrementally; align with **Brave Wallet** / browser wallet families users already use for deposits.

### 8.1 Privy Dashboard (per chain family)

> **EVM note:** One Privy `ethereum` embedded wallet = **one `0x` address on all EVM chains** (mainnet, Base, Polygon, …). Register **once** (`chain_type: "ethereum"`). Per-network RPC/`chainId` is Phase 8.2 (`EVM_CHAIN_IDS`) — **not** extra Privy wallets or extra `AgentWallet` rows per L2.

| Status | Task | Owner |
| ------ | ---- | ----- |
| [ ] | Enable **Ethereum** embedded wallets in Privy (EVM family) — Dashboard → Wallets → Embedded → Ethereum | [Dashboard] |
| [ ] | Enable **Solana** embedded wallets in Privy — Dashboard → Wallets → Embedded → Solana | [Dashboard] |
| [x] | Client: multi-chain onboarding (`ensure-agent-chain-wallet`, `NEXT_PUBLIC_ENABLED_AGENT_CHAINS`) | [Client] |
| [x] | Client policy env: `NEXT_PUBLIC_PRIVY_EVM_POLICY_ID`, `NEXT_PUBLIC_PRIVY_SOLANA_POLICY_ID` | [Client] |
| [x] | Backend: EVM/Solana address validation on `register-wallet`; `funded: false` when adapter missing | [Backend] |
| [ ] | Optional: per-chain **policies** in Privy Dashboard → Policies (`PRIVY_EVM_POLICY_ID`, `PRIVY_SOLANA_POLICY_ID`) | [Dashboard] |

### 8.2 EVM adapter

| Status | Task | Owner |
| ------ | ---- | ----- |
| [x] | `npm install viem` | [Backend] |
| [x] | `src/infrastructure/evm/client.ts` — viem `PublicClient` per chain ID | [Backend] |
| [x] | `src/services/chains/adapters/evm.ts` — `getBalance`, `executeTransaction` | [Backend] |
| [x] | `src/services/wallet/evm-signing.service.ts` — Privy `createViemAccount` + viem broadcast | [Backend] |
| [x] | `src/config/evm.ts` — `EVM_CHAIN_IDS`, `EVM_DEFAULT_CHAIN_ID`, `EVM_RPC_URL`, `EVM_RPC_URL_<id>` | [Backend] |
| [x] | `GET /wallets/balances?chain=ethereum&evm_chain_id=8453` | [Backend] |
| [x] | Client: `fetchWalletBalances('ethereum', { evmChainId })` | [Client] |
| [x] | Client: EVM wallet onboarding (Phase 8.1) | [Client] |

### 8.3 Solana adapter

| Status | Task | Owner |
| ------ | ---- | ----- |
| [x] | `npm install @solana/web3.js` | [Backend] |
| [x] | `src/infrastructure/solana/client.ts` — `@solana/web3.js` `Connection` | [Backend] |
| [x] | `src/config/solana.ts` — `SOLANA_RPC_URL`, `SOLANA_CAIP2`, `SOLANA_COMMITMENT` | [Backend] |
| [x] | `src/services/chains/adapters/solana.ts` — `getBalance`, `executeTransaction` | [Backend] |
| [x] | `src/services/wallet/solana-signing.service.ts` — Privy `signAndSendTransaction` | [Backend] |
| [x] | `src/services/wallet/solana-transaction.service.ts` — web3.js transfer + confirm | [Backend] |
| [x] | Client: Solana wallet onboarding (Phase 8.1) | [Client] |

### 8.4 Client multi-chain UX

| Status | Task | Owner |
| ------ | ---- | ----- |
| [x] | `NEXT_PUBLIC_DEFAULT_AGENT_CHAIN` + `NEXT_PUBLIC_EVM_DEFAULT_CHAIN_ID` | [Client] |
| [x] | Settings: agent wallet card per enabled chain (`AgentWalletSection`) | [Client] |
| [x] | Multi-chain balances in `AgentWalletProvider` | [Client] |
| [x] | Deposits: Sui → dapp-kit · EVM → `window.ethereum` · Solana → `window.solana` | [Client] |
| [x] | Sidebar shows default-chain wallet label | [Client] |

**Exit criteria:** At least two chain families (e.g. Sui + EVM) work end-to-end · adding chain #3 is adapter + config only.

---

## Phase 4 — Shared identity (cross-cutting)

> Depends on Phase 1–3. Ensures GitHub → Gmail → email OTP = same user.

| Status | Task | Owner |
| ------ | ---- | ----- |
| [x] | `/auth/me` upsert: email `@unique`, normalize before write | [Backend] |
| [x] | Return `409 ACCOUNT_MERGE_REQUIRED` on email conflict across DIDs | [Backend] |
| [x] | Client: handle `account_transfer_required` / merge — show merge prompt | [Client] |
| [x] | Settings: **Connected accounts** with `useLinkAccount` (Google, GitHub, email) | [Client] |
| [x] | Webhook route `POST /api/v1/webhooks/privy` — verify Svix signature | [Backend] |
| [x] | Handle `user.transferred_account` — delete orphan `User`, keep wallet on survivor | [Backend] |
| [x] | Handle `user.linked_account` — refresh email from Privy user | [Backend] |

**Exit criteria:** Same email via two providers → one `User` row · one `AgentWallet` after merge.

---

## Phase 5 — Agent integration

> Depends on Phase 3 signing (or Phase 7 registry if multi-chain first). Chat/deploy come later.

| Status | Task | Owner |
| ------ | ---- | ----- |
| [x] | `execute_transaction` tool — `{ chain_id, action, params }`; resolve wallet from session + registry | [Backend] |
| [x] | `query_chain` tool — read-only balance via `ChainAdapter` | [Backend] |
| [x] | User approval modal for txs above threshold | [Client] |
| [x] | `api-ref.md` chat examples — no `wallet` / `wallet_address` in bodies | [Backend] |
| [x] | `POST /api/v1/chat` — stub agent + optional Claude + tools | [Backend] |

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
| [x] | `client/src/app/refresh/page.tsx` — `getAccessToken()` + redirect | [Client] |
| [x] | Next.js middleware: `privy-session` without `privy-token` → `/refresh` | [Client] |
| [x] | Skip redirect on `privy_oauth_*` query params | [Client] |

### 6.3 Deploy checklist

| Status | Task | Owner |
| ------ | ---- | ----- |
| [x] | `docs/deploy-checklist.md` — `npm run db:deploy` on production Postgres | [Backend] |
| [x] | `CORS_ORIGIN` = production frontend URL (documented in checklist + `.env.example`) | [Backend] |
| [x] | No secrets in logs; `PRIVY_AUTHORIZATION_PRIVATE_KEY` server-only (documented) | [Backend] |
| [x] | `npm run check` — `tsc --noEmit` + tests | [Backend] |

---

## Dependency graph

```
Phase 0 (infra + dashboard)
    ├── Phase 1 (backend auth) ──────┐
    └── Phase 2 (client login) ────────┤
                                       ▼
                         Phase 3 (agent wallet — Sui MVP)
                                       │
                         ┌─────────────┴─────────────┐
                         ▼                           ▼
                   Phase 7                    Phase 4 / 5 / 6
            (chain abstraction)            (identity / agent / prod)
                         │
                         ▼
                   Phase 8 (EVM, Solana, …)
```

**Recommended order:** Phase 3.3–3.4 (Sui vertical slice) → **Phase 7** (registry + schema) → Phase 3.5 signing via adapter → Phase 8 per chain.

---

## Phase 9 — DeepBook V3 (DeFi)

> Full checklist: [docs/deepbook-v3-TODO.md](../../docs/deepbook-v3-TODO.md). Composable `services/defi/` + `@mysten/deepbook-v3` + public indexer.

| Status | Task | Owner |
| ------ | ---- | ----- |
| [x] | Phase A — SDK, `services/defi/`, config | [Backend] |
| [x] | Phase B — Balance manager (Prisma + ensure + deposit/withdraw) | [Backend] |
| [x] | Phase C — Pools + indexer client (reads) | [Backend] |
| [x] | Phase D — Swap (quote + execute + approval) | [Both] |
| [ ] | Phase E — Orders (place/cancel + open orders) | [Both] |
| [x] | Phase F — Flash loans (permission-gated, round_trip) | [Both] |
| [x] | Phase F2 — Flash loan bundle + flash auto-approve → [flash-loan-bundle-TODO.md](../../docs/flash-loan-bundle-TODO.md) | [Both] |
| [ ] | Phase G — DEEP staking | [Both] |
| [ ] | Phase H — Governance (propose/vote) | [Both] |
| [ ] | Phase I — Indexer time-series (OHLCV, volume, trades) | [Backend] |
| [ ] | Phase J — Agent permissions (settings → DB → approval engine) | [Both] |

**Depends on:** Phase 3 (Sui agent wallet + signing), Phase 5 (`query_chain` / `execute_transaction`).

---

## Phase 10 — Wallet assets (“In your wallet”)

> Full checklist: [docs/wallet-assets-TODO.md](../../docs/wallet-assets-TODO.md). Profile holdings view + multi-token detection (Sui RPC + DeepBook catalog; Privy API for EVM/SOL).

| Status | Task | Owner |
| ------ | ---- | ----- |
| [x] | Token catalog from DeepBook indexer `/assets` | [Backend] |
| [x] | `GET /api/v1/wallets/assets` — Sui multi-coin balances | [Backend] |
| [x] | Privy `wallets().balance.get` for EVM/Solana named assets | [Backend] |
| [x] | `query_chain` → `token_balances` | [Backend] |
| [x] | `InYourWalletSection` on profile / settings | [Client] |
| [ ] | Agent pre-swap balance checks | [Backend] |

**Depends on:** Phase 3 (agent wallet + `privy_wallet_id`). Shares indexer client with Phase 9.

---

## Phase 11 — App builder, artifacts & deploy

> Full checklist: [docs/app-builder-deploy-TODO.md](../../docs/app-builder-deploy-TODO.md). Artifacts in chat, Walrus publish, explorer listings, **E2B Hobby (free) plan optimization**, optional Docker worker at scale.

| Status | Task | Owner |
| ------ | ---- | ----- |
| [x] | Phase 1 — Artifacts (DB + panel + `generate_app`, **$0 E2B**) | [Both] |
| [ ] | Phase 2 — `POST /build` preview | [Backend] |
| [x] | Phase 3 — Template-only Walrus deploy (**backend**; client UI pending) | [Both] |
| [x] | Phase 4 — E2B scaffold + pipeline + mock tests (credit gate pending) | [Backend] |
| [ ] | Phase 5 — Move AppRegistry + explorer API | [Both] |
| [ ] | Phase 6 — Self-hosted Docker worker (when credits exhausted) | [DevOps] |
| [x] | Phase 7 — E2B webhooks + per-user deploy quota (partial) | [Backend] |

**Hobby constraints:** $100 one-time credits, 10 GB disk, 1 h max runtime, 2 concurrent deploys recommended. See doc optimization playbook.

**Depends on:** Phase 5 (chat + agent tools), Phase 3 (agent wallet signing for Move publish).

---

## Quick reference: who builds what

| Concern | Backend | Client | Dashboard |
| ------- | ------- | ------ | --------- |
| Login UI | — | ✅ | — |
| Session cookie verify | ✅ | — | — |
| User row in Postgres | ✅ | — | — |
| Agent wallet create (Privy) | — | ✅ per `chain_type` | ✅ enable chain |
| Personal wallet deposit (Brave, etc.) | — | ✅ dapp-kit / wagmi | — |
| Session signer | — | ✅ `addSigners` | ✅ auth key + policies |
| Sign transactions | ✅ via `ChainAdapter` | — | ✅ per-chain policies |
| Chain reads / balances | ✅ `chains/registry` | — | — |
| Email unique constraint | ✅ | — | — |
| Login method transfer | — | ✅ UX | ✅ enable |
