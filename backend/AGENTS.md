# Radiant Backend — Agent Instructions

When implementing or modifying anything under `backend/`, **read and follow**:

`backend/.agents/skills/radiant-backend/SKILL.md`

For **Inngest** (deploy queue, durable functions), also read:

- `backend/.agents/skills/inngest-radiant/SKILL.md`
- Upstream skills in `backend/.agents/skills/inngest/` ([inngest-skills](https://github.com/inngest/inngest-skills))

Key rules:

- Layered architecture: `api/` → `services/` → `infrastructure/`
- **No `any`** in TypeScript — use `unknown`, Zod, and generated Prisma types
- **Prisma**: `migrate dev` / `migrate deploy` only — never edit applied migrations
- Agent wallets are **Privy-generated** — verify in `services/auth`, resolve in `services/wallet`
- API responses use the standard envelope (`success`, `data`, `meta`, `error`)
- Before finishing: run checks in `.cursor/rules/verify-before-complete.mdc` (backend `tsc` / `npm test`; client `lint` / `build` if you touched `client/`)

## Stellar / Soroswap swaps

Stellar same-chain swaps use **Soroswap** (`stellar-soroswap` provider). Config: `backend/src/config/soroswap.ts`, `soroswap-chains.ts`. Routing schema export: `docs/swap-bridge-routing-schema.json` (re-run `backend/scripts/export-swap-bridge-schema.ts` after token/routing changes).

**Quote → build → sign → submit flow:**

1. `getSoroswapQuote` — rate limit → dedupe cache → `POST /quote` → quote store (`soroswap-quote.service.ts`).
2. `buildSoroswapTransaction` — `POST /quote/build` returns unsigned XDR (`soroswap-build.service.ts`).
3. `signStellarTransaction` — Privy Tier 2 `rawSign` over the Stellar transaction hash (`wallet/stellar-signing.service.ts`); server never holds private keys.
4. `executeSignedStellarTransaction` — Horizon/Soroban submit + optional Inngest tracking (`soroswap-execute.service.ts`).

**Agent tools:** `stellar_swap_quote` / `stellar_swap` via chain plugin (`services/agent/chains/stellar/soroswap/`). Fast path: `swap-stellar-execute.ts`.

**Routing fallback:** When both tokens are on Stellar but the user picked another chain, emit `stellar_routing_fallback_offered` — **no Soroswap HTTP until consent**. See `services/defi/stellar-routing/` and exported `stellar_routing_fallback` in the routing schema.

**Observability:** structured log spans `stellar_swap_quote_total` and `stellar_routing_fallback_accepted_total` in `soroswap-observability.service.ts`.
