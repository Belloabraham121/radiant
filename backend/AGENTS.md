# Radiant Backend — Agent Instructions

When implementing or modifying anything under `backend/`, **read and follow**:

`backend/.agents/skills/radiant-backend/SKILL.md`

Key rules:

- Layered architecture: `api/` → `services/` → `infrastructure/`
- **No `any`** in TypeScript — use `unknown`, Zod, and generated Prisma types
- **Prisma**: `migrate dev` / `migrate deploy` only — never edit applied migrations
- Agent wallets are **Privy-generated** — verify in `services/auth`, resolve in `services/wallet`
- API responses use the standard envelope (`success`, `data`, `meta`, `error`)
