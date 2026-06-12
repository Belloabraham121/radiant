# Production deploy checklist

Run through this list before pointing production traffic at Radiant.

## Database

- [ ] `DATABASE_URL` points at production Postgres (not local Docker).
- [ ] Run migrations once per release:

```bash
cd backend
npm run db:deploy
```

`db:deploy` runs `prisma migrate deploy` + `prisma generate`. Prefer `npm run start:prod` on the host so migrations run before the server boots.

## Backend environment

- [ ] `NODE_ENV=production`
- [ ] `CORS_ORIGIN` = exact production frontend origin (scheme + host + port if non-default), e.g. `https://app.example.com`
- [ ] `PRIVY_APP_ID` / `PRIVY_APP_SECRET` = **production** Privy app (separate from dev)
- [ ] `PRIVY_WEBHOOK_SIGNING_SECRET` set if webhooks are enabled
- [ ] `PRIVY_AUTHORIZATION_PRIVATE_KEY` server-only — never in client env or logs
- [ ] `LOG_LEVEL=info` (or `warn`) in production

## Client environment

- [ ] `NEXT_PUBLIC_PRIVY_APP_ID` = same production Privy app ID
- [ ] `NEXT_PUBLIC_APP_URL` = production app URL (OAuth redirects)
- [ ] `NEXT_PUBLIC_API_URL` = production backend URL (server-side fetches only; browser uses same-origin `/api/v1` rewrite)

## Privy Dashboard (production app)

- [ ] HttpOnly cookies enabled + production domain DNS verified
- [ ] Allowed OAuth redirect URLs include `https://<domain>/auth`
- [ ] Login methods: Google, GitHub, email OTP
- [ ] Login method transfer enabled (shared identity)

## Cookie refresh (SSR)

- [ ] `/refresh` page deployed (client)
- [ ] Next.js middleware redirects `/app/*` when `privy-session` present but `privy-token` missing

## Pre-flight checks

```bash
# Backend
cd backend
npx tsc --noEmit
npm test

# Client
cd client
npx tsc --noEmit
npm run build
```

## Security

- [ ] No secrets in application logs (authorization private key, app secret, webhook secret)
- [ ] Backend not exposed without TLS
- [ ] Postgres and Redis not publicly reachable without auth
