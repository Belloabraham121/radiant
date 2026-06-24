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
