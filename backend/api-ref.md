# Radiant API Reference

Backend API and environment checklist. Implementation lives under `src/`.

## Health

| Method | Path | Description |
| ------ | ---- | ----------- |
| `GET` | `/health` | Liveness |

## Versioned API (`/api/v1`)

| Method | Path | Description |
| ------ | ---- | ----------- |
| `POST` | `/api/v1/chat` | Agent conversation (Claude or stub) with `query_chain` + `execute_transaction` tools |
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
| `GET` | `/api/v1/wallets/balances` | Agent wallet balances (from session) |

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
    "pending_transaction": null
  }
}
```

Large transfers return `pending_transaction` instead of broadcasting immediately. Approve with:

```json
{
  "message": "Approve transaction",
  "session_id": "abc-123",
  "approve_transaction_id": "uuid-from-pending_transaction.id"
}
```

Auto-approve thresholds (env): `AGENT_AUTO_APPROVE_MAX_SUI` (default 25), `AGENT_AUTO_APPROVE_MAX_ETH`, `AGENT_AUTO_APPROVE_MAX_SOL`.

## WebSocket

| Path | Events (planned) |
| ---- | ---------------- |
| `/socket.io` | `chat:token`, `deploy:progress`, `transaction:pending` |

## Environment checklist

See `.env.example`. Required for production:

- `PRIVY_APP_ID`, `PRIVY_APP_SECRET`
- `ANTHROPIC_API_KEY`
- `DATABASE_URL`, `REDIS_URL`
- `SUI_RPC_URL`, `WALRUS_*`, `RADIANT_REGISTRY_PACKAGE_ID`
- `CORS_ORIGIN`
