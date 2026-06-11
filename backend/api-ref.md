# Radiant API Reference

Backend API and environment checklist. Implementation lives under `src/`.

## Health

| Method | Path | Description |
| ------ | ---- | ----------- |
| `GET` | `/health` | Liveness |

## Versioned API (`/api/v1`)

| Method | Path | Description |
| ------ | ---- | ----------- |
| `POST` | `/api/v1/chat` | Agent conversation (Claude + tools) |
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
| `GET` | `/api/v1/auth/me` | Current user + agent wallet (cookie required). Upserts local `User` row on first call. |
| `POST` | `/api/v1/auth/register-wallet` | **First-time only** — persist embedded Sui wallet after client creates it |
| `POST` | `/api/v1/auth/logout` | End session |
| `GET` | `/api/v1/wallets/balances` | Agent wallet balances (from session) |

There is no `POST /auth/register` or `POST /auth/login` — Privy handles both. See [docs/privy-implementation-plan.md](./docs/privy-implementation-plan.md).

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
