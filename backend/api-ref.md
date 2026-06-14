# Radiant API Reference

Backend API and environment checklist. Implementation lives under `src/`.

## Health

| Method | Path | Description |
| ------ | ---- | ----------- |
| `GET` | `/health` | Liveness |

## Versioned API (`/api/v1`)

| Method | Path | Description |
| ------ | ---- | ----------- |
| `POST` | `/api/v1/chat` | Agent conversation (OpenAI or stub) with `query_chain`, `execute_transaction`, and `update_memory` tools |
| `GET` | `/api/v1/chat/sessions` | List chat threads for the authenticated user |
| `POST` | `/api/v1/chat/sessions` | Create a new chat thread |
| `GET` | `/api/v1/chat/sessions/:sessionId/messages` | Load messages for a thread (404 if not owned) |
| `GET` | `/api/v1/chat/sessions/:sessionId/transactions` | Agent transaction history for a thread (404 if not owned) |
| `GET` | `/api/v1/agent/transactions` | Paginated agent wallet activity for the authenticated user |
| `GET` | `/api/v1/agent/transactions/:id` | Single transaction detail (params, result, explorer URL) |
| `POST` | `/api/v1/agent/transactions/:id/approve` | Approve a pending agent transaction (UI / app actions) |
| `POST` | `/api/v1/agent/transactions/:id/reject` | Reject a pending agent transaction |
| `GET` | `/api/v1/projects/:projectId/actions` | Supported app actions + param field docs for a saved project |
| `POST` | `/api/v1/projects/:projectId/actions/:actionName` | Execute action via agent wallet (`swap`, `flash_loan`, …) |
| `GET` | `/api/v1/installations/:installationId/actions` | Supported app actions for an installed app |
| `POST` | `/api/v1/installations/:installationId/actions/:actionName` | Execute action on an installed app (installer's agent wallet) |
| `POST` | `/api/v1/build` | Preview app build without deploying |
| `POST` | `/api/v1/deploy` | Full deploy pipeline (E2B + Walrus + registry) |
| `GET` | `/api/v1/apps` | Public marketplace listings |
| `POST` | `/api/v1/app/:id/call` | Call a listed app programmatically |

### Authentication (Privy — unified sign up & sign in)

Radiant has **no separate sign-up endpoint**. With Privy, **sign up and sign in are the same flow**:

- **New user** — Google, GitHub, or email OTP → Privy creates the account → sets `privy-token` cookie → client creates embedded Sui wallet → backend upserts user via `register-wallet`.
- **Returning user** — same buttons/flow → Privy authenticates → same cookie → `GET /auth/me` returns existing user.

Auth happens on the **client** (Privy SDK). The backend only **verifies** the HttpOnly `privy-token` cookie — not custom JWT, no password.

**Shared identity:** GitHub, Google, and email OTP with the **same email** must resolve to one Privy user → one agent wallet → one memory. **`email` is unique** in the database (normalized). Session identity is `privy_user_id`. Email login uses a **two-step OTP** (`sendCode` → `loginWithCode`). Enable Privy **Login method transfer** in the Dashboard. See [privy-implementation-plan.md § Shared identity](./docs/privy-implementation-plan.md).

| Method | Path | Description |
| ------ | ---- | ----------- |
| `GET` | `/api/v1/auth/me` | Current user, profile (`avatar_seed`, `display_name`), agent wallets (cookie required). Upserts local `User` on first call. |
| `POST` | `/api/v1/auth/register-wallet` | **First-time only** — persist embedded Sui wallet after client creates it |
| `POST` | `/api/v1/auth/logout` | End session |
| `POST` | `/api/v1/webhooks/privy` | Privy webhooks (Svix signature). Handles `user.linked_account`, `user.transferred_account`. |
| `GET` | `/api/v1/wallets/balances` | Agent wallet native balance (from session) |
| `GET` | `/api/v1/wallets/assets` | Multi-token holdings. Sui via RPC; EVM/Solana via Privy. Query: `chain`, `evm_chain_id`, `include_zero`, `include_usd` |

There is no `POST /auth/register` or `POST /auth/login` — Privy handles both. See [docs/privy-implementation-plan.md](./docs/privy-implementation-plan.md).

**`GET /api/v1/auth/me`** response includes profile fields for Dicebear avatars (client renders from `avatar_seed` + `avatar_style`; image is not stored):

```json
{
  "success": true,
  "data": {
    "privy_user_id": "did:privy:...",
    "email": "user@example.com",
    "display_name": "Ada Lovelace",
    "avatar_seed": "550e8400-e29b-41d4-a716-446655440000",
    "avatar_style": "lorelei",
    "member_since": "2026-06-12T02:06:53.000Z",
    "linked_accounts": ["google", "github"],
    "agent_wallet": { },
    "agent_wallets": []
  }
}
```

### Agent chat

Wallet addresses are **never** sent in the request body — the backend resolves the agent wallet from the authenticated session (`privy-token` cookie).

**`POST /api/v1/chat`** — requires cookie.

```json
// Request
{
  "message": "What's my SUI balance?",
  "session_id": "optional-uuid"
}

// Response
{
  "success": true,
  "data": {
    "reply": "Your SUI agent wallet holds 12.5000 SUI.",
    "session_id": "abc-123",
    "mode": "stub",
    "tool_calls": [{ "name": "query_chain", "result": { } }],
    "pending_transaction": null,
    "message_id": "uuid-of-persisted-assistant-message"
  }
}
```

`session_id` is optional on first message (a new thread is created). On follow-up messages, pass the returned `session_id` so the agent loads full thread context from Postgres.

Large transfers return `pending_transaction` instead of broadcasting immediately. Approve with:

```json
{
  "message": "Approve transaction",
  "session_id": "abc-123",
  "approve_transaction_id": "uuid-from-pending_transaction.id"
}
```

Auto-approve thresholds (env): `AGENT_AUTO_APPROVE_MAX_SUI` (default 25), `AGENT_AUTO_APPROVE_MAX_ETH`, `AGENT_AUTO_APPROVE_MAX_SOL`.

### Agent transactions

Read-only ledger of on-chain actions initiated by the agent wallet via chat. Requires cookie.

**`GET /api/v1/agent/transactions`** — query params:

| Param | Type | Description |
| ----- | ---- | ----------- |
| `page` | number | Page (default 1) |
| `limit` | number | Page size (default 20, max 100) |
| `status` | string | `pending_approval`, `rejected`, `expired`, `submitted`, `success`, `failure` |
| `category` | string | `swap`, `transfer`, `deepbook_balance`, `deepbook_order`, `deepbook_cancel`, `deepbook_modify`, `deepbook_settled`, `flash_loan`, `stake`, `governance`, `other` |
| `chain_id` | string | `sui`, `ethereum`, `solana` |
| `session_id` | uuid | Filter to a chat thread |

```json
{
  "success": true,
  "data": {
    "items": [
      {
        "id": "uuid",
        "status": "success",
        "category": "swap",
        "chain_id": "sui",
        "title": "Swap on DeepBook (SUI_USDC)",
        "amount_display": "1 SUI → 2.4 USDC",
        "digest": "0x…",
        "effects_status": "success",
        "session_id": "uuid-or-null",
        "message_id": "uuid-or-null",
        "created_at": "2026-06-13T00:00:00.000Z",
        "completed_at": "2026-06-13T00:00:05.000Z"
      }
    ],
    "meta": {
      "pagination": { "page": 1, "limit": 20, "total": 1 }
    }
  }
}
```

**`GET /api/v1/agent/transactions/:id`** — detail adds `action`, `params`, `result`, `error_code`, `error_message`, `wallet_address`, `workflow_step_index`, `submitted_at`, `explorer_url`.

**`GET /api/v1/chat/sessions/:sessionId/transactions`** — convenience list (`{ items: [...] }`) for one thread; 404 if session not owned.

**Agent tool `query_chain` → `agent_transactions`** — same ledger as the routes above, capped at 10 rows for chat context. Optional params: `limit` (max 10), `status`, `category`, `session_id`, `transaction_id` (single-row detail). `chain_id` filters by chain.

### Agent permissions

| Method | Path | Description |
| ------ | ---- | ----------- |
| `GET` | `/api/v1/agent/permissions` | Current agent permission flags |
| `PATCH` | `/api/v1/agent/permissions` | Update permissions (partial body) |
| `GET` | `/api/v1/users/me/permissions` | Alias of agent permissions GET |
| `PATCH` | `/api/v1/users/me/permissions` | Alias of agent permissions PATCH |

```json
{
  "auto_approve_enabled": true,
  "auto_approve_max_sui": 25,
  "allow_flash_loans": false,
  "auto_approve_flash_loans": false,
  "allow_governance": false
}
```

- `allow_flash_loans` — agent may call `deepbook_flash_loan` (default off).
- `auto_approve_flash_loans` — skip approval dialog for `swap_chain_repay` bundles that repay from swap output (no SUI notional cap). Wallet-repay routes always require approval.
- `allow_governance` — agent may call `deepbook_submit_proposal` and `deepbook_vote` (default off; governance txs always show approval dialog).

### Agent tools (DeepBook flash loans)

**`query_chain` → `flash_loan_quote`** (Sui only) — quote a flash loan bundle before execute.

```json
{
  "chain_id": "sui",
  "query": "flash_loan_quote",
  "params": {
    "pool_key": "SUI_USDC",
    "borrow_amount": 10000,
    "asset": "quote",
    "strategy": "swap_chain_repay",
    "steps": [{ "pool_key": "DEEP_USDC", "side": "buy", "amount": 10000 }]
  }
}
```

Returns `repay_feasible`, per-step `min_out`, `estimated_surplus`, and `warnings[]`. A single-step route may auto-append a return swap in the quote.

**`execute_transaction` → `deepbook_flash_loan`** — atomic borrow → optional swaps → repay in one PTB.

| Param | Description |
| ----- | ----------- |
| `pool_key` | Borrow pool (e.g. `SUI_USDC`) |
| `borrow_amount` | Display units |
| `asset` | `base` or `quote` (or `coin_key`) |
| `strategy` | `round_trip` or `swap_chain_repay` |
| `steps` | Up to 2 swaps for `swap_chain_repay`; include `min_out_display` from quote |
| `slippage_bps` | Default 100 |
| `repay_source` | `swap_output` (default), `wallet`, `merged` |

### App actions (generated apps)

Project-scoped and installation-scoped routes execute via the **authenticated user's agent wallet** (same pipeline as chat `execute_transaction`). Responses use the standard envelope; `data` is an `AppActionResult`:

| `data.status` | Meaning |
| ------------- | ------- |
| `executed` | Signed and submitted — includes `digest`, `explorer_url`, `result` |
| `approval_required` | User must approve — includes `pending`, `agent_transaction_id`; approve via `POST /api/v1/agent/transactions/:id/approve` |
| `error` | Validation or execution failure — includes `error.code`, `error.message` |

**`GET /api/v1/projects/:projectId/actions`** — returns the project's persisted action schema (`schema_version`, `app_id`, `protocol`, `actions[]` with param fields). Swap-template and DeFi apps get a default DeepBook schema on `generate_app`; non-DeFi projects return `protocol: "custom"` with an empty `actions` array. Installations inherit the source project's schema.

**`POST /api/v1/projects/:projectId/actions/swap`** example:

```json
{
  "side": "sell",
  "amount": 1,
  "pool_key": "SUI_USDC",
  "slippage_bps": 100
}
```

**`POST /api/v1/projects/:projectId/actions/flash_loan`** — same params as agent `deepbook_flash_loan` (see flash loan table above), with canonical names (`borrow_amount`, `steps`, …).

Installation routes mirror project routes under `/api/v1/installations/:installationId/actions/...`.

## WebSocket

| Path | Events (planned) |
| ---- | ---------------- |
| `/socket.io` | `chat:token`, `deploy:progress`, `transaction:pending` |

## Environment checklist

See `.env.example`. Required for production:

- `PRIVY_APP_ID`, `PRIVY_APP_SECRET`
- `OPENAI_API_KEY` (or `AGENT_PROVIDER=stub` for local dev without OpenAI)
- `DATABASE_URL`, `REDIS_URL`
- `SUI_RPC_URL`, `WALRUS_*`, `RADIANT_REGISTRY_PACKAGE_ID`
- `CORS_ORIGIN`
