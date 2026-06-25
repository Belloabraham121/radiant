<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Radiant client — agent rules

Rules for AI agents and contributors working in `client/`. Read this before adding or changing frontend code.

---

## Stack

| Layer | Choice |
|-------|--------|
| Framework | Next.js 16 (App Router) |
| UI | React 19, Tailwind CSS 4, shadcn/base-ui |
| Auth | Privy (`@privy-io/react-auth`) — HttpOnly cookies, no tokens in JS |
| Agent wallet | Privy embedded Sui wallet + backend registration |
| Personal wallet | `@mysten/dapp-kit-react` (deposits only) |
| API | `fetch` via `apiFetch` → `/api/v1/*` (browser same-origin rewrite) |

---

## Layout

```
client/src/
├── app/                    # Routes only — thin pages, metadata, layouts
│   ├── auth/               # Login / signup (Privy whitelabel)
│   └── app/                # Authenticated shell (AppShell)
├── components/
│   ├── auth/               # AuthCard, OAuth UI
│   ├── app/                # Sidebar, AgentWalletSection, shell
│   ├── wallet/             # AgentWalletProvider, AppWalletProvider
│   ├── providers/          # PrivyAuthProvider
│   ├── landing/ explorer/  # Marketing / public pages
│   └── ui/                 # Shared primitives (button, dialog, …)
└── lib/                    # API clients, config, pure helpers — no JSX
    ├── api.ts              # apiFetch, ApiError, envelope parsing
    ├── auth-api.ts         # /auth/me
    ├── chat-api.ts         # sessions, messages, POST /chat
    ├── chat-messages.ts    # API message → UI mapping, receipts
    ├── wallet-api.ts       # register-wallet, balances
    └── privy-*.ts          # Privy/OAuth config helpers
```

| Put it here | Not here |
|-------------|----------|
| Route + metadata | `app/**/page.tsx` | Business logic in page files |
| Reusable UI | `components/**` | One-off markup duplicated across pages |
| HTTP + types | `lib/**` | `fetch` scattered in components |
| Session/global state | Context providers in `components/wallet/` or `providers/` | Prop drilling through 5+ layers |

### Chat sessions

- Routes: `/app` (redirect to latest or empty new chat), `/app/chat/[sessionId]` (active thread).
- `ChatSessionsProvider` + `useChatSessions()` — sidebar session list, `createSession`, `refreshSessions`.
- `useChatSession(sessionId?)` — load history, send messages, approval flow.
- `ChatView` — shared chat UI; pages stay thin.
- Do **not** seed chat from `app-data.ts`; all threads come from `/api/v1/chat/sessions`.

---

## API layer

- **Always** use `apiFetch` from `@/lib/api` for backend calls. Never raw `fetch("/api/v1/...")` in components.
- Browser requests use **same-origin** paths (`/api/v1/...`) with `credentials: "include"` so Privy cookies are sent.
- Server Components that need the API use `getApiBaseUrl()` (direct `NEXT_PUBLIC_API_URL`).
- Parse the standard envelope (`success`, `data`, `error`, `meta`). Throw `ApiError` on failure.
- Add new endpoints as small modules in `lib/` (e.g. `wallet-api.ts`), not inline in components.

```ts
// Good
import { apiFetch } from "@/lib/api";
export async function fetchWalletBalances() {
  return apiFetch<WalletBalanceData>("/api/v1/wallets/balances");
}

// Bad — bypasses envelope, cookies, and shared error handling
const res = await fetch("http://localhost:3001/api/v1/wallets/balances");
```

---

## Auth & secrets

### Never store in client-accessible storage

Do **not** put these in `localStorage`, `sessionStorage`, IndexedDB, React state persisted to disk, or cache libraries:

| Forbidden in client cache | Why |
|---------------------------|-----|
| Privy access / identity tokens | HttpOnly cookies only — Privy + backend own this |
| OAuth client secrets | Dashboard only |
| OTP codes | Ephemeral, in-memory during login step only |
| `privy_oauth_*` query params | Strip after Privy SDK processes return |
| Private keys, mnemonics, seed phrases | Never touch the client |
| Backend app secrets | Server env only |
| Full auth API responses with PII | Fetch when needed; don’t persist to disk |

### Safe in `NEXT_PUBLIC_*` env

Only **public** IDs and URLs: `NEXT_PUBLIC_PRIVY_APP_ID`, `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_APP_URL`, signer quorum ID, policy ID. Never `PRIVY_APP_SECRET` or OAuth secrets.

### Auth flow conventions

- Login UI: `AuthCard` + `useLoginWithOAuth` / `useLoginWithEmail`. OAuth return is handled on `/auth` by the Privy SDK (query params `privy_oauth_code`, `privy_oauth_state`, `privy_oauth_provider`).
- After Privy login: one `fetchAuthMe()` to sync the backend user row, then redirect to `/app`.
- Cookie refresh (production SSR): middleware on `/app/*` redirects to `/refresh` when `privy-session` exists but `privy-token` is missing; `SessionRefresh` calls `getAccessToken()` then redirects to `redirect_uri` or `/auth`.
- User avatars: Dicebear **Lorelei** via `lib/avatar/generate.ts` (seed = Privy user id); Radiant palette in `lib/avatar/palette.ts`. Use `UserAvatar` / `useUserProfile`.
- Wallet onboarding: `AgentWalletProvider` runs **once per `user.id`** — do not re-trigger on every Privy `user` object reference change.

---

## Caching

Think **offline-first**: show last-known-good data when the network fails; fail visibly; let the user retry. Prefer explicit refresh over silent polling loops.

### Cache tiers

| Tier | Use for | Do not use for |
|------|---------|----------------|
| **In-memory** (React state, context, module singleton) | Authenticated session data, balances, wallet address for current tab | Data that must survive refresh (unless explicitly designed) |
| **Ref guards** (`onboardedUserIdRef`, `inFlightRef`) | Prevent duplicate fetches / effect loops | Long-term storage |
| **sessionStorage** | Non-sensitive UI ephemera (e.g. draft message text) | Anything auth- or wallet-related |
| **localStorage** | User preferences only (theme, layout) — opt-in | Tokens, email, balances, wallet IDs |
| **Next.js `fetch` cache / RSC** | Public, static, or slowly changing server data | Per-user authenticated data (unless cookie-forwarding is correct and documented) |

### Rules

1. **Scope cache keys by user** — e.g. `balances:${privyUserId}`. Clear all user-scoped cache on logout.
2. **TTL stale data** — balances and live chain data are stale quickly; treat cached values as hints, show “last updated” or refresh affordance.
3. **No secret-bearing cache keys** — never `localStorage.setItem("privy_token", ...)`.
4. **Invalidate on mutation** — after `register-wallet`, deposit, or sign-and-send, refresh affected queries once; don’t spam the API.
5. **One-shot onboarding** — expensive sequences (`/auth/me` → `register-wallet` → `balances`) run once per session per user unless the user clicks Refresh.

### If adding a cache library (SWR, TanStack Query)

- Use a shared client in `lib/query-client.ts`.
- `staleTime` / `gcTime` per resource type (balances: short; static config: long).
- `queryKey` must include user id for authenticated data.
- `persist` plugins: **never** persist auth or wallet queries.
- Global `onLogout`: `queryClient.clear()`.

---

## React & effects — bad patterns to avoid

These caused real bugs in this codebase. Do not reintroduce them.

| Bad | Good |
|-----|------|
| `useEffect(() => { fetch() }, [unstableCallback])` where callback depends on Privy `user` object | Effect deps: `user?.id`, `ready`, `authenticated` only; read `user` from a ref inside async work |
| `void initOAuth(...)` without `try/catch` | `await initOAuth(...)` + surface errors to the user |
| Polling or re-fetching every second with no guard | `inFlightRef` + `onboardedUserIdRef`; manual `refresh()` for updates |
| `useCallback(..., [syncing])` feeding back into an effect that calls it | Use refs for in-flight guards; keep callback deps stable |
| Storing OAuth secrets in `.env` or backend `.env` for frontend OAuth | Privy Dashboard only |
| New provider per page | Single `PrivyAuthProvider` in root layout; `AgentWalletProvider` in `AppShell` |
| Giant “god” components with fetch + UI + animation | Split: `lib/*` fetch, provider for state, presentational components |

### Effect checklist

Before adding `useEffect` + async:

- [ ] What are the **minimal stable deps**? (ids, booleans — not whole objects)
- [ ] Is there an **in-flight** guard?
- [ ] Will this run **once** or on every parent re-render?
- [ ] On logout, is state **reset**?

---

## Components & UI

- `"use client"` only when needed (hooks, browser APIs, Privy, dapp-kit).
- Prefer existing `components/ui/*` and Tailwind tokens (`var(--hero-*)`) — match surrounding files.
- Animations: respect `prefers-reduced-motion` (see `useReducedMotion`, `AuthCard` GSAP guard).
- Errors: `role="alert"` for user-facing failures; map `ApiError.code` to actionable copy.
- Loading: disable actions + spinner; distinguish “initial load” vs “refreshing” vs “offline, showing cached”.

---

## Wallet-specific

| Wallet | Owner | Client module |
|--------|-------|----------------|
| **Agent** (embedded Sui / EVM / Solana) | Privy + Radiant backend | `AgentWalletProvider`, `wallet-api.ts` |
| **Personal** (Brave, etc.) | User’s browser extension | `AppWalletProvider`, dapp-kit — deposits only |

- Agent wallet creation/signers: `AgentWalletProvider` → `ensure-agent-chain-wallet.ts` — one wallet per **chain family** (`sui`, `ethereum`, `solana`). **EVM:** one `0x` address for all EVM chains; do not create per-L2 rows.
- Enabled families: `NEXT_PUBLIC_ENABLED_AGENT_CHAINS` (default `sui`). Mirror backend `ENABLED_CHAINS`.
- Default UI chain: `NEXT_PUBLIC_DEFAULT_AGENT_CHAIN`. Balances/deposits for EVM use `NEXT_PUBLIC_EVM_DEFAULT_CHAIN_ID`.
- Personal-wallet deposits (`lib/personal-wallet.ts`): Sui → dapp-kit · EVM → injected EIP-1193 · Solana → `window.solana` + `@solana/web3.js`.
- Shared identity: `ConnectedAccountsSection` uses `useLinkAccount`; login merge errors via `lib/auth-errors.ts` (`ACCOUNT_MERGE_REQUIRED`, `account_transfer_required`).
- Agent chat: `postChat` → `POST /api/v1/chat` (no wallet in body). Large transfers return `pending_transaction` → `TransactionApprovalModal`.
- Personal wallet: never used for agent automation; only user-initiated deposits in `AgentWalletSection`.

---

## Environment

Copy `client/.env.example` → `.env.local`. Required for app/wallet flows:

```
NEXT_PUBLIC_PRIVY_APP_ID=
NEXT_PUBLIC_API_URL=http://localhost:3001
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_PRIVY_SIGNER_QUORUM_ID=
NEXT_PUBLIC_PRIVY_SUI_POLICY_ID=
NEXT_PUBLIC_PRIVY_EVM_POLICY_ID=
NEXT_PUBLIC_PRIVY_SOLANA_POLICY_ID=
NEXT_PUBLIC_ENABLED_AGENT_CHAINS=sui
NEXT_PUBLIC_DEFAULT_AGENT_CHAIN=sui
NEXT_PUBLIC_EVM_DEFAULT_CHAIN_ID=1
NEXT_PUBLIC_SOLANA_RPC_URL=https://api.mainnet-beta.solana.com
```

OAuth callback setup is documented in `.env.example` (Privy + Google + GitHub redirect URIs).

---

## Pre-ship checklist

- [ ] **Verify** — `npm run lint`; if UI/routes changed, `npm run build` (see `.cursor/rules/verify-before-complete.mdc`)
- [ ] No secrets in client env, storage, or cache
- [ ] API calls go through `apiFetch` in `lib/`
- [ ] No effect-driven fetch loops (check Network tab)
- [ ] Authenticated routes under `app/app/` use `AppShell`
- [ ] Errors shown to user, not swallowed with `void`
- [ ] `npm run lint` clean on touched files (and `npm run build` when app code changed)

---

## Security guards

- **Cookie auth** — Privy HttpOnly cookies only; use `AuthenticatedGate` / middleware for `/app/*`; no tokens in `localStorage` or `sessionStorage`.
- **Mutations** — browser calls use same-origin `apiFetch` with cookies; backend validates `Origin` on POST/PATCH/DELETE.
- **Client cache** — clear user-scoped in-memory and `localStorage` on logout (`clearWalletSessionCache`, `clearAllStoredChatAppScopes`); never persist PII or API keys.
- **Outbound fetch** — backend proxy and agent `call_api` share SSRF policy; do not add parallel fetch helpers without `ssrf-guard.ts`.

---

## Related docs

- Backend API & auth plan: `backend/docs/privy-implementation-plan.md`
- Implementation checklist: `backend/docs/TODO.md`
- OAuth URLs: `client/.env.example`
