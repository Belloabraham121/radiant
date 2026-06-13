# User profile — TODO

Profile-only identity surface for Radiant users. **Not** agent wallets, vault, permissions, or connected-accounts management — those stay in Settings.

**Design direction:** Every user gets a distinctive **Dicebear Lorelei** avatar tinted with Radiant’s playful palette (`--hero-coral`, `--hero-blue`, `--hero-mint`, `--hero-amber`, `--hero-violet`). OAuth profile photos are optional later; **generated art is the default identity mark.**

---

## Scope

### In scope

| Area | What |
| ---- | ---- |
| Avatar | Deterministic generated image from user id (same user → same avatar everywhere) |
| Display name | From Privy: Google `name`, GitHub `name` / `@username`, email local-part fallback |
| Email | Primary email (read-only) |
| Login badges | Small chips: Google · GitHub · Email (read-only) |
| Member since | `User.created_at` from backend |
| Placement | Reusable `UserProfileCard` in Settings + Sidebar footer |

### Out of scope (Settings elsewhere)

- Link / unlink accounts (`ConnectedAccountsSection`)
- Agent wallet provisioning, deposit dialogs (`AgentWalletSection`)
- Agent vault & permission toggles
- Logout button (can sit below profile card in Settings, not inside the card)

### In scope (wallet holdings — new)

- **“In your wallet”** collapsible section below profile card — see [wallet-assets-TODO.md](./wallet-assets-TODO.md)
- Shows multi-token holdings (SUI, USDC, DEEP, popular DeepBook assets), not native-only

---

## Avatar system (generated)

### Concept

- On first sign-up, assign an avatar from a **seed** (e.g. `privy_user_id` or stored `avatar_seed`).
- Render via **@dicebear/core** + **lorelei** style with Radiant color overrides (`client/src/lib/avatar/`).
- Avatar is **owned by Radiant**, not tied to Google/GitHub CDN — consistent brand, works for email-only users.

### Style (MVP)

| Pack | Vibe |
| ---- | ---- |
| `lorelei` | Playful illustrated characters — Radiant gradient backgrounds + bold hair/accessory colors |

### Rules

1. **Deterministic** — same seed + style → identical output on every device.
2. **No external fetch required** for default avatar (inline SVG or data URL).
3. **Optional later:** “Regenerate” or “Pick style” in profile (stores new seed/style on backend).
4. **Optional later:** Upload custom image or use OAuth photo as override — not MVP.

### Technical options (pick during implementation)

- Custom SVG builder in `lib/avatar/` (full control, on-brand)
- Library seed input (e.g. Dicebear-style) with Radiant palette overrides
- Pre-render PNG/WebP set + index from hash (less flexible, faster)

---

## Design tasks

| Status | Task | Owner |
| ------ | ---- | ----- |
| [x] | Profile card layout — avatar size, name hierarchy, email, badges, member since | [Design] |
| [x] | Avatar style guide — Dicebear Lorelei + `--hero-*` palette | [Design] |
| [x] | Sidebar chip — small avatar + truncated name (matches card) | [Design] |
| [ ] | Empty / loading states for profile while Privy + `/auth/me` load | [Design] |

---

## Backend tasks

| Status | Task | Owner |
| ------ | ---- | ----- |
| [x] | Prisma: `display_name`, `avatar_seed`, `avatar_style` on `User` | [Backend] |
| [x] | Sync `display_name` from Privy on `/auth/me` + webhooks | [Backend] |
| [x] | On user create: set `avatar_seed` (uuid) + default `avatar_style` | [Backend] |
| [x] | Extend `GET /api/v1/auth/me` with `display_name`, `avatar_seed`, `avatar_style`, `member_since` | [Backend] |

---

## Client tasks

| Status | Task | Owner |
| ------ | ---- | ----- |
| [x] | `lib/avatar/generate.ts` — Dicebear Lorelei + Radiant palette | [Client] |
| [x] | `lib/user-profile.ts` — display name, email, badges from Privy user | [Client] |
| [x] | `UserAvatar` — generated image, accessible `alt` from display name | [Client] |
| [x] | `UserProfileCard` — avatar, name, email, badges, member since | [Client] |
| [x] | Wire Settings profile section + Sidebar footer to `UserProfileCard` / `UserAvatar` | [Client] |
| [x] | Remove mock `USER.name` / letter-only fallbacks in Sidebar + Settings | [Client] |

---

## Display name resolution (client)

Priority order:

1. `auth/me.display_name` (backend sync)
2. `user.google.name`
3. `user.github.name`
4. `@user.github.username`
5. Email local-part before `@`
6. Generic “Radiant user”

---

## Exit criteria

- Every signed-in user sees a **unique Dicebear Lorelei avatar** in Radiant colors in Sidebar and Settings.
- Google / GitHub / email sign-ups show correct **name + email**; avatar does not depend on OAuth photos.
- Same avatar everywhere for a given account; survives refresh via `/auth/me` seed/style.

---

## References

- Current placeholders: `client/src/app/app/settings/page.tsx`, `client/src/components/app/Sidebar.tsx`
- Auth data: Privy `usePrivy().user`, `GET /api/v1/auth/me`
- Backend user model: `backend/prisma/schema.prisma` (`User`)
