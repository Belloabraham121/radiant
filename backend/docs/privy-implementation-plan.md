# Privy Auth & Agent Wallet — Backend Implementation Plan

Radiant uses **[Privy](https://docs.privy.io/)** for authentication (Google, GitHub, email OTP) and **embedded Sui agent wallets**. Sessions are stored in **HttpOnly cookies** (`privy-token`, `privy-session`) — not custom JWT auth and not server-derived wallets (no `MASTER_SEED`, no local key storage).

This document outlines **two implementation tools** the backend must build. Source: Privy Docs (via MCP `search_privy_docs` / `query_docs_filesystem_privy_docs`).

**Related:** [api-ref.md](../api-ref.md) · [radiant-backend SKILL](../.agents/skills/radiant-backend/SKILL.md)

---

## What Radiant is *not* doing

| Approach | Radiant |
| -------- | ------- |
| Custom JWT auth (Auth0/Firebase + Privy custom auth) | ❌ Privy **is** the auth provider |
| Server-derived wallets from email + master seed | ❌ |
| `Authorization: Bearer` only (localStorage sessions) | ❌ Cookie sessions in production |
| Client passes `wallet` in API body | ❌ Backend resolves wallet from verified session |

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│  Client (Next.js) — whitelabel login                            │
│  Google OAuth · GitHub OAuth · Email OTP (no password)          │
│  PrivyProvider + HttpOnly cookies (privy-token)                 │
│  On login → create Sui embedded wallet + add session signer     │
└────────────────────────────┬────────────────────────────────────┘
                             │ same-origin requests (cookies auto-sent)
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│  Backend (Express) — backend/                                   │
│                                                                 │
│  TOOL 1: Cookie session auth                                    │
│    cookie-parser → extract privy-token                            │
│    PrivyClient.verifyAccessToken → userId, sessionId            │
│    Optional: identity token → linked accounts                   │
│                                                                 │
│  TOOL 2: Agent wallet + server signing                          │
│    Resolve user's Sui embedded wallet (Privy user API)          │
│    Session signer (app authorization key) on wallet             │
│    Agent builds PTB → Privy signs (rawSign / signTransactionBytes)│
│    → broadcast via Sui RPC                                      │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
                    Privy API · Sui mainnet
```

**Control model:** [User-owned wallet + agent signer](https://docs.privy.io/recipes/wallets/user-and-server-signers) (Privy Model 2). Users own the embedded wallet; Radiant's backend signs within policy limits so the **AI agent can trigger transactions on the user's behalf**.

---

## Tool 1 — Cookie session authentication

**Purpose:** Verify Google / GitHub / email logins on every protected backend route using **HttpOnly cookies**, not a custom JWT stack.

### Sign up vs sign in

Privy uses a **unified auth flow** — there is no separate backend `POST /register` or `POST /login`.

| User state | What happens |
| ---------- | ------------ |
| **New (sign up)** | User clicks Google / GitHub / email on client → Privy creates account → cookie set → create Sui wallet → `POST /auth/register-wallet` → `addSigners` |
| **Returning (sign in)** | Same client buttons → Privy authenticates → cookie set → `GET /auth/me` returns existing user + wallet |

The client UI may still show "Log in" vs "Sign up" tabs for messaging, but both call the **same Privy methods** (`useLoginWithOAuth`, `useLoginWithEmail`). The backend distinguishes first-time vs returning via whether a `User` / `AgentWallet` row exists in Postgres.

### Shared identity across login methods

Users may register with **GitHub**, then later sign in with **Google (Gmail)** or **email OTP** — as long as it is the **same email address**, they must land on the **same Radiant user**, **same agent wallet**, and **same agent memory**.

Privy models this as **one user object (Privy DID)** with multiple **linked accounts** (GitHub, Google, verified email). Radiant mirrors that: **one `privy_user_id` → one `User` → one `AgentWallet`**.

#### Login methods & UX

| Method | Client flow | Notes |
| ------ | ----------- | ----- |
| **GitHub** | `initOAuth({ provider: 'github' })` | One-click redirect. Email comes from GitHub profile. |
| **Google** | `initOAuth({ provider: 'google' })` | One-click redirect. Email comes from Google account. |
| **Email** | **Two steps:** `sendCode({ email })` → user enters OTP → `loginWithCode({ email, code })` | OTP valid ~10 minutes. No password. Extra UI step required. |

Email is **not** instant like OAuth — the user must receive and enter the OTP before the session cookie is set.

```typescript
// Client — email OTP (whitelabel)
const { sendCode, loginWithCode } = useLoginWithEmail();

// Step 1: user submits email
await sendCode({ email: "user@gmail.com" });

// Step 2: user submits OTP from inbox
await loginWithCode({ email: "user@gmail.com", code: "123456" });
```

Reference: [Email OTP](https://docs.privy.io/authentication/user-authentication/login-methods/email), [Whitelabel auth](https://docs.privy.io/authentication/user-authentication/whitelabel).

#### Same email, different provider (e.g. GitHub → Gmail)

**Goal:** `you@gmail.com` via GitHub on day 1 and `you@gmail.com` via Google on day 2 → same agent, same wallet, same chat history.

**How Privy handles it:**

1. All methods attach to a **single Privy user** once linked — [linked accounts](https://docs.privy.io/user-management/users/linking-accounts).
2. If a login method’s email is already tied to **another** Privy account, the client may get `linked_to_another_user`. Fix: enable **Login method transfer** in the Dashboard so the user can merge accounts.  
   [Account transfer](https://docs.privy.io/recipes/dashboard/account-transfer)
3. Users can also link methods while logged in: `useLinkAccount` → `linkGoogle`, `linkGithub`, `linkEmail`.

**Radiant backend rules (shared state):**

| Rule | Implementation |
| ---- | -------------- |
| **Source of truth** | `privy_user_id` (Privy DID from `verifyAccessToken`) — never create two `User` rows for the same DID |
| **Email (unique)** | Normalize (`trim`, lowercase) from Privy `linked_accounts`; **`email` is `@unique` in Postgres** — one Radiant user per email address |
| **Cross-method login** | Same email via GitHub, Google, or OTP → same Privy user (once linked) → same `User` row → same `email` |
| **Agent wallet** | One `AgentWallet` per `User` — persists across GitHub / Google / email logins |
| **Agent memory** | Walrus blobs keyed to **agent wallet address** — unchanged when login method changes |
| **Account merge** | On Privy `user.transferred_account` webhook, delete orphan `User` row; surviving row keeps `email` + `AgentWallet` |

```prisma
// Both privy_user_id and email are unique.
// Normalize email before insert/update (src/utils/normalize-email.ts).
model User {
  privy_user_id String  @unique
  email         String? @unique  // normalized; required once onboarding completes
}
```

**`GET /auth/me` upsert logic:**

1. Verify cookie → `privyUserId`
2. Fetch Privy user → extract normalized `email` from `linked_accounts`
3. **Upsert by `privy_user_id`** (primary). If a row already exists for this `email` under a different `privy_user_id`, Privy accounts are not merged yet — return `409 ACCOUNT_MERGE_REQUIRED` and prompt client to complete [login method transfer](https://docs.privy.io/recipes/dashboard/account-transfer).
4. Return existing `AgentWallet` if present — **never** mint a second wallet for the same `privy_user_id` or `email`

#### Optional: link methods in Settings

Expose **Settings → Connected accounts** so users can proactively link Google, GitHub, and email to one profile before switching devices. Uses `useLinkAccount` on the client; backend learns via `/auth/me` linked_accounts refresh.

#### Webhooks (recommended)

| Webhook | Backend action |
| ------- | -------------- |
| `user.linked_account` | Refresh cached linked methods on `User` |
| `user.transferred_account` | Merge/delete duplicate `User`; preserve `AgentWallet` on surviving `privy_user_id` |
| `user.authenticated` | Audit log (optional) |

### Privy Dashboard setup

1. **Login methods** — enable Google, GitHub, Email (OTP). No password.  
   [Configure login methods](https://docs.privy.io/basics/get-started/dashboard/configure-login-methods)

2. **Login method transfer** — enable under User management → Authentication. Required for same-email merges across providers.  
   [Account transfer](https://docs.privy.io/recipes/dashboard/account-transfer)

3. **HttpOnly cookies** (production app) — Configuration → App settings → Domains → enable cookies + verify DNS.  
   [Configure cookies](https://docs.privy.io/recipes/react/cookies)

4. **Separate app IDs** — dev app (localhost client-set cookies) vs production app (server-set cookies on verified domain).

5. **Identity token** (recommended) — enable “Return user data in identity token” for linked accounts without extra API calls.  
   [Identity tokens](https://docs.privy.io/user-management/users/identity-tokens)

### Cookie mechanics

| Cookie | Role |
| ------ | ---- |
| `privy-token` | Short-lived access token (~1h). Present = authenticated. |
| `privy-session` | Refresh session. Absent `privy-token` + present `privy-session` → client refresh flow (`/refresh`). |
| `privy-refresh-token` | Managed by Privy SDK only — **never** read on backend |

With cookies enabled, the browser sends `privy-token` automatically on same-origin API calls. **Do not** require clients to send `wallet` or manual `Authorization` headers for first-party requests.

### Backend files to implement

| File | Responsibility |
| ---- | -------------- |
| `src/infrastructure/privy/client.ts` | Singleton `PrivyClient` |
| `src/services/auth/privy-auth.service.ts` | `verifyAccessToken`, load user |
| `src/services/auth/auth.types.ts` | `AuthenticatedUser`, Zod schemas |
| `src/api/middleware/auth.ts` | Read `req.cookies['privy-token']`, attach `req.user` |
| `src/api/middleware/correlation-id.ts` | Request ID |
| `src/api/middleware/error-handler.ts` | Standard envelope errors |
| `src/api/routes/v1/auth/me.ts` | `GET /api/v1/auth/me` — user + agent wallet summary |
| `src/api/routes/v1/auth/logout.ts` | `POST /api/v1/auth/logout` — clear session (coordinate with client) |
| `src/config/env.ts` | `PRIVY_APP_ID`, `PRIVY_APP_SECRET`, `CORS_ORIGIN` |
| `src/config/cors.ts` | `credentials: true`, allow frontend origin |
| `src/app.ts` | `cookie-parser()`, CORS, routes |

### Auth middleware flow

```typescript
// Pseudocode — implement in services/auth + api/middleware
const accessToken = req.cookies["privy-token"];
if (!accessToken) return fail(req, res, 401, { code: "UNAUTHORIZED", message: "..." });

const claims = await privy.utils().auth().verifyAccessToken({ access_token: accessToken });
// claims.userId (Privy DID), claims.sessionId

req.user = { privyUserId: claims.userId, sessionId: claims.sessionId };
```

Reference: [Access tokens — cookie setup](https://docs.privy.io/authentication/user-authentication/access-tokens), [Node.js setup](https://docs.privy.io/basics/nodeJS/setup).

### Prisma (user index)

```prisma
model User {
  id            BigInt   @id @default(autoincrement())
  privy_user_id String   @unique  // Privy DID (shared across GitHub/Google/email once linked)
  email         String?  @unique  // normalized; unique — one Radiant user per email
  created_at    DateTime @default(now())
  updated_at    DateTime @updatedAt

  agent_wallet  AgentWallet?
}

model AgentWallet {
  id              BigInt   @id @default(autoincrement())
  user_id         BigInt   @unique
  user            User     @relation(fields: [user_id], references: [id])
  privy_wallet_id String   @unique
  sui_address     String   @unique
  signer_added    Boolean  @default(false)
  created_at      DateTime @default(now())
  updated_at      DateTime @updatedAt
}
```

Migration: `npx prisma migrate dev --name add_user_and_agent_wallet`.

### API contract (auth)

**`GET /api/v1/auth/me`** — requires `privy-token` cookie.

```json
{
  "success": true,
  "data": {
    "privy_user_id": "did:privy:...",
    "email": "user@example.com",
    "linked_accounts": ["google", "github"],
    "agent_wallet": {
      "sui_address": "0x...",
      "funded": true
    }
  },
  "meta": { "correlation_id": "...", "timestamp": "..." },
  "error": null
}
```

**No `wallet` field in request bodies** on `/chat`, `/build`, `/deploy` — address comes from `req.user` after Tool 1.

### Tests

| Test | Location |
| ---- | -------- |
| Missing cookie → 401 | `tests/unit/auth-middleware.test.ts` |
| Invalid token → 401 | `tests/unit/privy-auth.service.test.ts` |
| Valid token → `req.user` set | `tests/integration/auth-me.test.ts` |

---

## Tool 2 — Embedded agent wallet & server-side signing

**Purpose:** Each user gets a **Privy embedded Sui wallet** (agent wallet). The Radiant AI agent builds transactions; the backend signs via **session signers** so the agent can act on the user's behalf within policies.

### Privy Dashboard setup

1. **Authorization key** — generate P-256 keypair, register public key in Dashboard → Authorization keys → key quorum (threshold 1).  
   [Signers quickstart — step 1–2](https://docs.privy.io/wallets/using-wallets/signers/quickstart)

2. **Sui policies** (recommended) — cap transfer amounts, allowlist commands (`TransferObjects`, `SplitCoins`, etc.).  
   [Sui example policies](https://docs.privy.io/controls/policies/example-policies/sui)

3. Store **authorization private key** in `PRIVY_AUTHORIZATION_PRIVATE_KEY` (server env only).

### Wallet creation (multi-chain embedded)

Radiant uses **whitelabel login** (`useLoginWithOAuth`, `useLoginWithEmail`) — automatic `createOnLogin` does **not** run for custom flows. Create agent wallets **explicitly** after first login for each enabled chain family (`NEXT_PUBLIC_ENABLED_AGENT_CHAINS`).

| Chain family | Privy hook | `chain_type` in Postgres |
| ------------ | ---------- | ------------------------ |
| Sui | `@privy-io/react-auth/extended-chains` → `createWallet({ chainType: 'sui' })` | `sui` |
| EVM (all L2s) | `@privy-io/react-auth` → `createWallet()` | `ethereum` |
| Solana | `@privy-io/react-auth/solana` → `createWallet()` | `solana` |

**EVM:** One embedded Ethereum wallet ⇒ **one `0x` address** on mainnet, Base, Polygon, etc. Register a single `AgentWallet` row with `chain_type: "ethereum"`. Phase 8.2 adds per-network RPC via `EVM_CHAIN_IDS`, not extra Privy wallets.

**Privy Dashboard (Phase 8.1):** Enable embedded **Ethereum** and **Solana** under Wallets → Embedded. Optional policies: `PRIVY_EVM_POLICY_ID`, `PRIVY_SOLANA_POLICY_ID` (and client `NEXT_PUBLIC_*` mirrors).

### Wallet creation (Sui embedded)

**Frontend (coordinate, not backend code):**

```typescript
// After OAuth / email OTP succeeds
import { useCreateWallet } from "@privy-io/react-auth";

const { createWallet } = useCreateWallet();
const wallet = await createWallet({ chainType: "sui" });
// Then call backend POST /api/v1/auth/register-wallet { privy_wallet_id, sui_address }
```

**Backend alternative** (if wallet created server-side):

```typescript
const wallet = await privy.wallets().create({
  user_id: privyUserId,
  chain_type: "sui",
});
```

Reference: [Create a wallet](https://docs.privy.io/wallets/wallets/create/create-a-wallet) (`chain_type: 'sui'`), [Tier 2 / Sui](https://docs.privy.io/recipes/use-tier-2).

### Session signer (agent can sign without user online)

After wallet exists, frontend calls `addSigners` so the backend authorization key can sign within policy:

```typescript
import { useSigners } from "@privy-io/react-auth";

await addSigners({
  address: suiAddress,
  signers: [{
    signerId: process.env.NEXT_PUBLIC_PRIVY_SIGNER_QUORUM_ID,
    policyIds: [process.env.NEXT_PUBLIC_PRIVY_SUI_POLICY_ID].filter(Boolean),
  }],
});
```

Backend records `signer_added: true` in `AgentWallet` after `POST /api/v1/auth/register-wallet`.

Reference: [Server-side access via signers](https://docs.privy.io/recipes/wallets/session-signer-use-cases/server-side-access).

### Backend files to implement

| File | Responsibility |
| ---- | -------------- |
| `src/services/wallet/agent-wallet.service.ts` | Resolve wallet by `privyUserId`, cache in Prisma |
| `src/services/wallet/agent-wallet.repository.ts` | Prisma CRUD for `AgentWallet` |
| `src/services/wallet/sui-signing.service.ts` | Build hash → `privy.wallets().rawSign()` or Sui `signTransactionBytes` |
| `src/services/wallet/sui-transaction.service.ts` | Execute signed PTB via `@mysten/sui` |
| `src/services/chains/adapters/sui.ts` | `getBalance`, `executeTransaction` — uses signing service |
| `src/api/routes/v1/auth/register-wallet.ts` | Persist wallet + signer status after client onboarding |
| `src/config/privy.ts` | Authorization key, quorum ID, policy IDs |

### Signing flow (agent triggers transaction)

```
1. User asks agent: "Pay Alex 5 SUI"
2. Claude tool: execute_transaction({ chain_id, action, params })
3. services/agent/tools.ts → services/chains/adapters/sui.ts
4. sui adapter builds unsigned PTB (@mysten/sui)
5. sui-signing.service signs with Privy:
     - authorization context: app private key + user access token (from cookie)
     - privy.wallets().rawSign(walletId, { params: { hash } })
       OR Sui-specific signTransactionBytes API
6. sui-transaction.service broadcasts → returns tx digest
7. Optional: user approval gate for amounts > threshold (app logic, not Privy)
```

Reference: [Signing on the server](https://docs.privy.io/controls/authorization-keys/using-owners/sign/signing-on-the-server), [Agentic wallets Model 2](https://docs.privy.io/recipes/agent-integrations/agentic-wallets).

### API routes (wallet)

| Method | Path | Body | Notes |
| ------ | ---- | ---- | ----- |
| `POST` | `/api/v1/auth/register-wallet` | `{ privy_wallet_id, sui_address }` | After client creates embedded wallet |
| `GET` | `/api/v1/wallets/balances` | — | Uses agent wallet from session |
| `POST` | `/api/v1/wallets/sign-and-send` | `{ transaction_bytes }` | Internal / agent tool path |

Protected routes (`/chat`, `/deploy`, etc.) use Tool 1 + resolve agent wallet via Tool 2 automatically.

### Environment variables

```bash
# Tool 1
PRIVY_APP_ID=
PRIVY_APP_SECRET=
CORS_ORIGIN=http://localhost:3000

# Tool 2
PRIVY_AUTHORIZATION_PRIVATE_KEY=   # PEM — app signer key (never commit)
PRIVY_SIGNER_QUORUM_ID=            # Key quorum ID from Dashboard
PRIVY_SUI_POLICY_ID=               # Optional Sui policy
PRIVY_EVM_POLICY_ID=               # Optional EVM policy (all EVM chains share one agent address)
PRIVY_SOLANA_POLICY_ID=            # Optional Solana policy
ENABLED_CHAINS=sui                 # Comma-separated: sui,ethereum,solana
DEFAULT_AGENT_CHAIN=sui
SUI_RPC_URL=https://fullnode.mainnet.sui.io
EVM_CHAIN_IDS=1,8453,137           # Networks for same agent 0x address
EVM_DEFAULT_CHAIN_ID=1
EVM_RPC_URL=                       # Default-chain RPC (optional; per-chain: EVM_RPC_URL_8453=...)
SOLANA_RPC_URL=https://api.mainnet-beta.solana.com
SOLANA_CAIP2=solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp  # mainnet; devnet: solana:EtWTRABZaYq6iMfeYKouRu166VU2xqaew
SOLANA_COMMITMENT=confirmed
```

Frontend (for signer registration only):

```bash
NEXT_PUBLIC_PRIVY_APP_ID=
NEXT_PUBLIC_PRIVY_SIGNER_QUORUM_ID=
NEXT_PUBLIC_PRIVY_SUI_POLICY_ID=
NEXT_PUBLIC_PRIVY_EVM_POLICY_ID=
NEXT_PUBLIC_PRIVY_SOLANA_POLICY_ID=
NEXT_PUBLIC_ENABLED_AGENT_CHAINS=sui
NEXT_PUBLIC_DEFAULT_AGENT_CHAIN=sui
```

### Tests

| Test | Location |
| ---- | -------- |
| Resolve wallet for known user | `tests/unit/agent-wallet.service.test.ts` |
| Sign + broadcast (mock Privy) | `tests/unit/sui-signing.service.test.ts` |
| `register-wallet` persists row | `tests/integration/register-wallet.test.ts` |

---

## Implementation order

**Full trackable checklist:** [TODO.md](./TODO.md) — phases 0–6 with owners (`[Backend]` / `[Client]` / `[Dashboard]`), dependencies, and exit criteria.

| Phase | Focus | Depends on |
| ----- | ----- | ---------- |
| **0** | Infra, deps, Privy dev app, Docker | — |
| **1** | Tool 1 — cookie auth backend (`/auth/me`, middleware, `User`) | 0 |
| **2** | Client — PrivyProvider, OAuth, email OTP, API client | 0 |
| **3** | Tool 2 — agent wallet, signers, balances, Sui signing | 1 + 2 |
| **4** | Shared identity — unique email, merge, webhooks, link accounts | 3 |
| **5** | Agent tools — `execute_transaction`, approval UI | 3 |
| **6** | Production — HttpOnly cookies, `/refresh`, deploy | 4 + 5 |

```
Phase 0 → Phase 1 (backend auth) ──┐
      → Phase 2 (client login)  ──┴→ Phase 3 (wallet) → Phase 4 / 5 / 6
```

---

## Dependencies to add (`backend/package.json`)

```json
{
  "@privy-io/node": "latest",
  "@mysten/sui": "^2.x",
  "cookie-parser": "^1.4.7",
  "cors": "^2.8.5",
  "express": "^4.21.2",
  "zod": "^3.24.2"
}
```

---

## Privy doc index (MCP-sourced)

| Topic | URL |
| ----- | --- |
| Privy as auth provider | `/authentication/user-authentication/privy-auth` |
| OAuth (Google, GitHub) | `/authentication/user-authentication/login-methods/oauth` |
| Email OTP | `/basics/react/quickstart` |
| HttpOnly cookies | `/recipes/react/cookies` |
| Access token verify (Node) | `/authentication/user-authentication/access-tokens` |
| Node.js PrivyClient | `/basics/nodeJS/setup` |
| Session signers quickstart | `/wallets/using-wallets/signers/quickstart` |
| Server-side wallet access | `/recipes/wallets/session-signer-use-cases/server-side-access` |
| Sui / Tier 2 signing | `/recipes/use-tier-2` |
| Sui policies | `/controls/policies/example-policies/sui` |
| Agentic wallets overview | `/recipes/agent-integrations/agentic-wallets` |

---

## Checklist before merge

- [ ] No custom JWT issuance in Radiant backend
- [ ] `User.email` is `@unique`; always normalize (`trim`, lowercase) before upsert
- [ ] Auth reads `privy-token` cookie (Bearer header fallback optional for mobile later)
- [ ] No `wallet` / `wallet_address` in public API request bodies
- [ ] Agent wallet created via Privy (`chain_type: sui`), not server-derived
- [ ] Session signer registered so agent can sign server-side
- [ ] Private keys only in env (`PRIVY_AUTHORIZATION_PRIVATE_KEY`) — never Prisma/logs
- [ ] `.env.example` updated
- [ ] `api-ref.md` updated
- [ ] Follow [radiant-backend SKILL](../.agents/skills/radiant-backend/SKILL.md) layer placement
