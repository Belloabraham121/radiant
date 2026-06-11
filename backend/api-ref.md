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

Auth: Privy access token (header or session). Backend resolves the user's **Privy-generated agent Sui wallet** before any onchain action.

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
