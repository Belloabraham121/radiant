# Radiant Security Audit

**Date:** 2026-06-24  
**Scope:** Full-stack adversarial review (authentication prioritized, then API, wallet, proxy, infrastructure)  
**Assumption:** Hostile deployment environment, motivated attackers

---

## Threat Model

### Attacker profiles

| Profile | Access | Goals |
|---------|--------|-------|
| **Anonymous** | Public routes (`/health`, `/api/v1/apps`, marketing pages) | Recon, abuse unauthenticated endpoints, webhook probing |
| **Authenticated user** | Valid Privy session + HttpOnly cookies | Horizontal privilege escalation (IDOR), wallet abuse, SSRF via proxy/agent tools |
| **Malicious API consumer** | Stolen session cookie or same-origin XSS | Drain agent wallet, exfiltrate data, pivot to internal networks |
| **Insider / compromised dependency** | Repo, CI, env vars, Privy dashboard | Key theft, policy bypass, supply-chain backdoors |

### Entry points

- **Frontend:** `/auth` (OAuth, email OTP), `/app/*`, Next.js middleware, Privy SDK cookies
- **Backend:** `/api/v1/*` (Express), webhooks (`/api/v1/webhooks/*`), Inngest (`/api/inngest`)
- **Third-party:** Privy auth/signing, E2B sandboxes, OpenAI, Sui RPC, external APIs via agent/proxy

### Trust boundaries

```
Browser (Privy cookies) ──rewrite──► Next.js ──proxy──► Express API
                                              │
                    Privy verifyAccessToken ◄─┘
                                              │
                         Postgres / Turso / Redis / Privy signing
```

### Sensitive assets

- Privy access tokens (`privy-token`), session cookies, identity token (`privy-id-token`)
- `PRIVY_APP_SECRET`, `PRIVY_AUTHORIZATION_PRIVATE_KEY`, webhook secrets
- Agent embedded wallets + server signer quorum
- User PII (email, chat history, projects, notification rules)
- Internal notification API key

---

## 1. Vulnerability Summary

| Severity | Count |
|----------|------:|
| **Critical** | 2 |
| **High** | 5 |
| **Medium** | 10 |
| **Low** | 8 |
| **Total** | 25 |

---

## 2. Detailed Findings

### AUTH-01 — `POST /api/v1/wallets/sign-and-send` bypasses transaction approval

- **Severity:** Critical  
- **Affected component:** Backend — `backend/src/api/routes/v1/wallets/sign-and-send.ts`, `backend/src/services/wallet/sign-and-send.service.ts`  
- **Description:** The sign-and-send route calls `executeTransactionForUser` directly. It never invokes `transferRequiresApproval`, `createPendingTransaction`, or the agent approval UI flow. Supports `execute_bytes` (arbitrary base64 transaction bytes) and `transfer_sui` without amount caps.  
- **Exploitation scenario:**
  1. Attacker obtains a valid session (phishing, XSS, or compromised device).
  2. Attacker crafts a Sui PTB that transfers all SUI/coins from the victim’s agent wallet.
  3. Attacker `POST`s `{ "action": "execute_bytes", "transaction_bytes": "<base64>" }` to `/api/v1/wallets/sign-and-send`.
  4. Backend signs with the server signer and broadcasts — no modal, no approval record.
- **Impact:** Full agent wallet drain for any authenticated session.  
- **Recommended fix:** Remove `execute_bytes` from this route or route all mutations through `runExecuteTransactionToolWithApproval`. Apply the same approval/threshold logic as the agent chat path. Consider deprecating this endpoint if unused by the client.

---

### AUTH-02 — `execute_bytes` auto-approved when `auto_approve_enabled` is true (default)

- **Severity:** Critical  
- **Affected component:** Backend — `backend/src/services/agent/transaction-approval.service.ts`  
- **Description:** `execute_bytes` is in `MUTATING_EXECUTE_ACTIONS` but falls through to `return false` (no approval) when `auto_approve_enabled` is true (the default for new users). Only transfers above the SUI threshold require approval; arbitrary bytecode execution does not.  
- **Exploitation scenario:**
  1. User has default permissions (`auto_approve_enabled: true`).
  2. Attacker prompts the agent (or uses a compromised agent session) to call `execute_transaction` with `execute_bytes`.
  3. Transaction executes immediately with no user confirmation.
- **Impact:** Agent can be tricked into signing arbitrary on-chain actions within Privy policy limits.  
- **Recommended fix:** Always require explicit approval for `execute_bytes` regardless of auto-approve settings. Treat it like governance/flash-loan actions.

---

### AUTH-03 — `register-wallet` does not verify wallet ownership via Privy

- **Severity:** High  
- **Affected component:** Backend — `backend/src/api/routes/v1/auth/register-wallet.ts`, `backend/src/services/wallet/agent-wallet.service.ts`  
- **Description:** Registration accepts `privy_wallet_id` and `address` from the client body. The backend checks address uniqueness and format but does **not** call Privy to confirm the wallet belongs to `req.user.privyUserId`.  
- **Exploitation scenario:**
  1. Attacker learns victim’s public wallet address and Privy wallet ID (from chain explorers, leaked responses, or enumeration).
  2. Attacker registers that wallet against their own account before the victim completes onboarding.
  3. Victim receives `WALLET_ADDRESS_CONFLICT` — denial of service. In edge cases with misconfigured signers, this can desynchronize wallet state across environments.
- **Impact:** Wallet registration griefing; potential account/wallet state confusion.  
- **Recommended fix:** After parsing the body, call `getPrivyClient().wallets().get(privy_wallet_id)` and verify the wallet owner matches the authenticated Privy user and that `address` matches Privy metadata.

---

### AUTH-04 — Frontend `/app/*` not enforced for unauthenticated users

- **Severity:** High  
- **Affected component:** Frontend — `client/src/middleware.ts`, `client/src/app/app/layout.tsx`  
- **Description:** Middleware only redirects to `/refresh` when `privy-session` exists without `privy-token`. It does **not** redirect unauthenticated users away from `/app`. `AppShell` renders without a Privy auth gate.  
- **Exploitation scenario:**
  1. Unauthenticated user navigates directly to `/app/chat/[id]`.
  2. Shell UI renders; API calls return 401 but client-side state may briefly expose layout, cached data, or error messages.
  3. Shared-device users may see stale in-memory cache from a prior session if not cleared.
- **Impact:** Defense-in-depth failure; information disclosure; confused UX enabling social engineering.  
- **Recommended fix:** In middleware, redirect `/app/*` to `/auth` when `privy-token` is absent (unless OAuth return or `/refresh`). Add a client-side `AuthenticatedGate` in `AppShell` that redirects when `!authenticated`.

---

### AUTH-05 — Logout endpoint is unauthenticated (logout CSRF)

- **Severity:** Medium  
- **Affected component:** Backend — `backend/src/api/routes/v1/auth/logout.ts`  
- **Description:** `POST /api/v1/auth/logout` has no `requireAuth` and clears session cookies unconditionally.  
- **Exploitation scenario:**
  1. Attacker embeds a cross-site form/image beacon targeting `POST /api/v1/auth/logout`.
  2. On same-site subtrees or with future cookie `Domain` relaxation, victim session cookies could be cleared.
  3. Session interruption / annoyance; forced re-auth during sensitive flows.
- **Impact:** Session denial-of-service. Lower risk today due to SameSite=Lax on Privy cookies for cross-site POST.  
- **Recommended fix:** Require valid session for logout, or use CSRF tokens on cookie-authenticated mutations. Prefer Privy SDK logout as the primary path; treat backend logout as authenticated-only.

---

### AUTH-06 — Cookie domain mismatch between Privy (client host) and backend logout

- **Severity:** Medium  
- **Affected component:** Backend — `backend/src/api/routes/v1/auth/logout.ts`, deployment topology  
- **Description:** Logout derives `domain` from `CORS_ORIGIN`. Privy sets cookies on the Next.js app host. When the API is reached via rewrite, clearing cookies from the backend response may use a different `Domain` attribute than Privy set, leaving stale tokens.  
- **Exploitation scenario:**
  1. User logs out; backend clears cookies with `Domain=api.example.com` but Privy cookies are on `app.example.com`.
  2. `privy-token` persists; user appears logged out in UI but API still accepts requests (or vice versa).
- **Impact:** Broken logout, session fixation, ambiguous auth state.  
- **Recommended fix:** Perform cookie clearing only on the frontend origin (Next.js route handler) or align `Domain`, `Path`, and `SameSite` exactly with Privy Dashboard settings. Document production cookie topology in deploy checklist.

---

### AUTH-07 — No CSRF protection on cookie-authenticated state-changing APIs

- **Severity:** Medium  
- **Affected component:** Backend API layer (all `POST`/`PATCH`/`DELETE` with `credentials: include`)  
- **Description:** Authentication relies solely on HttpOnly cookies forwarded via same-origin rewrite. No CSRF tokens, no `Origin`/`Referer` validation middleware. Protection depends on `SameSite=Lax` and same-site deployment.  
- **Exploitation scenario:**
  1. Attacker finds an XSS on a sibling subdomain (`cdn.example.com`) sharing cookies.
  2. Or deployment moves API to a same-site but cross-origin host where Lax cookies are sent on top-level GET navigations.
  3. Attacker triggers wallet transfers, permission changes, or project deletes via forged requests.
- **Impact:** Cross-site request forgery against authenticated users under misconfiguration or XSS.  
- **Recommended fix:** Add CSRF double-submit token or validate `Origin`/`Referer` on mutations. Set `SameSite=Strict` for sensitive cookies where Privy allows.

---

### AUTH-08 — `AuthCard` redirects authenticated users to `/app` without syncing backend

- **Severity:** Medium  
- **Affected component:** Frontend — `client/src/components/auth/AuthCard.tsx` (lines 169–170)  
- **Description:** When `authenticated && !oauthReturn && !userInitiatedLogin`, the card redirects to `/app` without calling `fetchAuthMe()`. Account-merge errors (`ACCOUNT_MERGE_REQUIRED`) are skipped on this path.  
- **Exploitation scenario:**
  1. User with valid Privy session but email conflict lands on `/auth`.
  2. Auto-redirect to `/app` occurs; `AgentWalletProvider` fails later with opaque errors.
  3. Attacker socially engineers user through broken states.
- **Impact:** Broken onboarding/merge flows; user lockout confusion.  
- **Recommended fix:** Always call `fetchAuthMe()` before redirect when `authenticated`, or remove the auto-redirect branch and rely on `completeLogin`.

---

### AUTH-09 — `getAgentPermissions` returns permissive defaults when user row missing

- **Severity:** Medium  
- **Affected component:** Backend — `backend/src/services/agent/agent-permissions.service.ts`  
- **Description:** If Privy auth succeeds but `GET /auth/me` was never called (no Postgres user), `getAgentPermissions` returns `defaultAgentPermissions()` including `auto_approve_enabled: true`.  
- **Exploitation scenario:**
  1. Race between first API call and `/auth/me` upsert.
  2. Agent chat or tools run with default auto-approve before user record exists.
- **Impact:** Transactions auto-approved against default thresholds unintentionally.  
- **Recommended fix:** Return 404/`USER_NOT_FOUND` or safe-deny defaults (`auto_approve_enabled: false`) until user row exists.

---

### AUTH-10 — Default `auto_approve_enabled: true` for new users

- **Severity:** Medium  
- **Affected component:** Backend agent permissions defaults, Prisma user schema  
- **Description:** New users auto-approve agent transfers up to 25 SUI (configurable) without explicit opt-in.  
- **Exploitation scenario:**
  1. User signs up and chats with agent.
  2. Prompt injection or malicious app action triggers transfers under threshold.
  3. Funds move without modal approval.
- **Impact:** Financial loss via social engineering / prompt injection within auto-approve bounds.  
- **Recommended fix:** Default `auto_approve_enabled: false`; require explicit user enablement in Settings. Show first-run security notice.

---

### AUTH-11 — Identity token lookup fails open to server-side Privy API

- **Severity:** Low  
- **Affected component:** Backend — `backend/src/services/auth/privy-auth.service.ts` (`fetchPrivyUser`)  
- **Description:** Invalid/expired `privy-id-token` silently falls through to `privy.users()._get(privyUserId)` using app secret.  
- **Exploitation scenario:** Mostly benign; slightly widens reliance on app secret server-side lookup. No direct bypass found.  
- **Impact:** Minimal; minor observability loss on identity-token failures.  
- **Recommended fix:** Log identity-token verification failures at warn level; metric for monitoring token staleness.

---

### AUTH-12 — No rate limiting on authentication-adjacent backend routes

- **Severity:** Medium  
- **Affected component:** Backend — `/api/v1/auth/me`, `/api/v1/auth/register-wallet`, `/api/v1/auth/export`  
- **Description:** OTP brute force is handled by Privy, but backend routes have no per-IP or per-user rate limits.  
- **Exploitation scenario:**
  1. Attacker hammers `/auth/me` or `/auth/export` with stolen/leaked session tokens.
  2. DB load, data exfiltration at scale.
- **Impact:** Abuse, enumeration, DoS.  
- **Recommended fix:** Add token-bucket rate limiting (existing infra in `token-bucket.ts`) on auth and export endpoints.

---

### AUTH-13 — Session refresh page lacks rate limiting / abuse monitoring

- **Severity:** Low  
- **Affected component:** Frontend — `client/src/app/refresh/page.tsx`, `SessionRefresh.tsx`  
- **Description:** `/refresh` calls `getAccessToken()` once per visit with no throttling. Open redirect is mitigated by `sanitizeRedirectPath`.  
- **Impact:** Low; refresh loop could annoy users if misconfigured.  
- **Recommended fix:** Add loop detection; max refresh attempts before forced `/auth`.

---

### API-01 — SSRF via HTTP redirect in authenticated proxy

- **Severity:** High  
- **Affected component:** Backend — `backend/src/services/proxy/external-fetch.service.ts`  
- **Description:** URL validation runs on the initial URL only. `fetch` uses `redirect: "follow"`, allowing redirect chains to internal IPs/metadata endpoints not blocked on the final hop. Private IP regex misses IPv6 literals and DNS rebinding.  
- **Exploitation scenario:**
  1. Authenticated user (or agent via generated app) posts to `/api/v1/proxy` with `https://attacker.com/redirect`.
  2. Attacker 302s to `http://169.254.169.254/...` or internal Redis/Postgres if reachable.
  3. Response returned to user/agent — cloud credential theft.
- **Impact:** Internal network access, cloud metadata exposure.  
- **Recommended fix:** Disable redirects or re-validate each hop. Resolve DNS and block private/link-local ranges. Prefer allowlist for agent proxy use cases.

---

### API-02 — Agent `call_api` tool SSRF (weaker controls than proxy)

- **Severity:** High  
- **Affected component:** Backend — `backend/src/services/agent/browsing/call-api.service.ts`  
- **Description:** Blocklist-only SSRF guard; allows `http:`, follows redirects, no private IP range check (only hostname blocklist).  
- **Exploitation scenario:** Prompt user to “check this API URL”; agent fetches internal URL via redirect.  
- **Impact:** Same as API-01 via agent automation.  
- **Recommended fix:** Unify SSRF policy with `external-fetch.service.ts` improvements; block redirects or validate post-redirect.

---

### API-03 — Authenticated proxy forwards attacker-controlled `Authorization` headers

- **Severity:** Medium  
- **Affected component:** Proxy service, agent prompts  
- **Description:** Comment says Authorization is stripped from caller in one path, but proxy schema allows arbitrary headers except a small strip list — `Authorization` is **not** stripped in `external-fetch.service.ts` (only in comment for a different code path). Users can exfiltrate keys to attacker servers via proxy.  
- **Exploitation scenario:**
  1. User stores API key in generated app.
  2. Malicious app code or agent prompt sends key to `https://evil.com` through `/api/v1/proxy`.
- **Impact:** Third-party API key theft.  
- **Recommended fix:** Strip `Authorization`, `Cookie`, `X-Api-Key` from proxy unless URL host is on user-configured allowlist.

---

### INFRA-01 — Missing security headers (Helmet, CSP, HSTS)

- **Severity:** Medium  
- **Affected component:** `backend/src/app.ts`, Next.js config  
- **Description:** No `helmet` middleware, no Content-Security-Policy, no Strict-Transport-Security at API layer.  
- **Impact:** Increased XSS/clickjacking/MITM impact window.  
- **Recommended fix:** Add Helmet with CSP aligned to Privy requirements; HSTS in production; `X-Frame-Options` / `frame-ancestors`.

---

### INFRA-02 — Inngest serve endpoint exposed without network restriction

- **Severity:** Medium  
- **Affected component:** `backend/src/app.ts` — `/api/inngest`  
- **Description:** Inngest handler mounted when enabled; security depends on Inngest signing keys and network placement.  
- **Impact:** Unauthorized function invocation if signing misconfigured.  
- **Recommended fix:** Restrict `/api/inngest` to Inngest IP allowlist or internal network; verify signing in production.

---

### INFRA-03 — `PRIVY_WEBHOOK_SIGNING_SECRET` optional in env schema

- **Severity:** Low  
- **Affected component:** `backend/src/config/env.ts`  
- **Description:** Zod schema marks webhook secret optional; runtime rejects unsigned webhooks in handler (good), but misconfiguration fails at first webhook not at boot.  
- **Impact:** Deployments may run without webhooks until first event fails.  
- **Recommended fix:** Require secret in production `NODE_ENV=production`.

---

### DATA-01 — `GET /api/v1/auth/export` has no additional confirmation

- **Severity:** Low  
- **Affected component:** `backend/src/api/routes/v1/auth/export.ts`  
- **Description:** Single cookie auth exports notification/user data with no step-up auth or export audit log.  
- **Impact:** Session hijack enables one-click PII export.  
- **Recommended fix:** Re-authentication (Privy step-up), rate limit, audit log, optional email notification.

---

### DATA-02 — Chat app scope stored in `localStorage` without encryption

- **Severity:** Low  
- **Affected component:** `client/src/lib/chat-app-scope.ts`  
- **Description:** Project/installation UUIDs and names persisted in plaintext localStorage.  
- **Impact:** Local disk exposure on shared machines; not secret but reveals activity.  
- **Recommended fix:** Accept risk or scope to sessionStorage; clear on logout (partially done via wallet cache clear — extend to chat scope).

---

### FE-01 — Markdown links render without URL scheme allowlist

- **Severity:** Low  
- **Affected component:** `client/src/components/app/AgentMessageMarkdown.tsx`  
- **Description:** Agent-generated markdown links use raw `href` with `target="_blank"`. Depends on `react-markdown` default URL sanitization.  
- **Exploitation scenario:** Agent emits `[click](javascript:...)` or `data:` URLs if not filtered.  
- **Impact:** Stored XSS if sanitization insufficient.  
- **Recommended fix:** Add explicit `urlTransform` allowing only `http`, `https`, and relative paths; add `rehype-sanitize`.

---

### FE-02 — Artifact preview iframe executes user/agent-generated code

- **Severity:** Medium  
- **Affected component:** `client/src/lib/artifact-preview.ts`  
- **Description:** Preview runs compiled artifact code in iframe with postMessage bridge to parent.  
- **Exploitation scenario:** Malicious generated app sends crafted postMessages to trigger unintended parent actions or exfiltrate session context.  
- **Impact:** XSS-like behavior within app origin; bridge abuse.  
- **Recommended fix:** Strict postMessage origin/type validation; sandbox iframe (`sandbox` attribute); CSP inside preview document.

---

### LOGIC-01 — Email merge conflict on webhook sync silently skipped

- **Severity:** Low  
- **Affected component:** `backend/src/services/auth/user.service.ts` — `syncUserFromPrivyUser`  
- **Description:** When email owner differs from Privy user, sync returns early without alerting.  
- **Impact:** Stale email in DB vs Privy; support confusion.  
- **Recommended fix:** Log metric/alert; surface merge requirement to user on next `/auth/me`.

---

### LOGIC-02 — Privy `user.transferred_account` webhook can merge wallets without user present

- **Severity:** Low (by design)  
- **Affected component:** `backend/src/services/auth/privy-webhook.service.ts`  
- **Description:** Webhook-driven merge deletes orphan user. Verified by Svix signature (good).  
- **Impact:** If webhook secret leaked, attacker could trigger destructive merges.  
- **Recommended fix:** Rotate webhook secret; idempotency keys; audit log merges.

---

## 3. Attack Chains

### Chain A — Session + sign-and-send wallet drain (Critical)

```
Phish login / XSS on app origin
  → steal privy-token (HttpOnly bypass via XSS fetch with credentials)
  → POST /api/v1/wallets/sign-and-send { execute_bytes }
  → server signer broadcasts drain PTB
  → no approval modal (AUTH-01 + AUTH-02)
```

### Chain B — Prompt injection + default auto-approve (High)

```
User signs up (auto_approve_enabled: true by default)
  → malicious chat prompt or compromised installed app
  → agent calls transfer_native for 25 SUI
  → below threshold → no approval (AUTH-10)
  → repeat until wallet empty
```

### Chain C — SSRF proxy + cloud metadata (High)

```
Authenticated session
  → POST /api/v1/proxy { url: "https://attacker.tld/r" }
  → 302 to http://169.254.169.254/latest/meta-data/iam/...
  → credentials in response body (API-01)
```

### Chain D — Wallet registration griefing (Medium)

```
Attacker observes victim wallet address + privy_wallet_id
  → attacker register-wallet first (AUTH-03)
  → victim onboarding fails with WALLET_ADDRESS_CONFLICT
  → DoS until manual support intervention
```

### Chain E — Weak frontend gate + cached wallet data (Medium)

```
Shared computer, user A logs out incompletely
  → user B opens /app directly (AUTH-04)
  → in-memory cache may briefly show stale balances/addresses
  → social engineering / privacy leak
```

---

## 4. Secure Design Recommendations

### Authentication & sessions

1. **Unify auth gate:** Middleware + `AppShell` must both require `privy-token` for `/app/*`.
2. **Verify wallet ownership server-side** on every `register-wallet` call via Privy API.
3. **Treat logout as authenticated** or move cookie clearing exclusively to the Next.js origin.
4. **Document and test cookie topology** for every production deployment (app host, API host, `Domain`, `SameSite`).
5. **Add CSRF defenses** on all cookie-authenticated mutations.

### Wallet & agent safety

1. **Single execution pipeline:** All signing paths (chat agent, UI, API) must pass through approval policy.
2. **Never auto-approve `execute_bytes`.**
3. **Default-deny permissions** for new users (`auto_approve_enabled: false`).
4. **Require Privy policy rules** as defense-in-depth on server signer (amount limits, recipient allowlists).

### Network & SSRF

1. Shared SSRF module with redirect disabled, DNS pinning, private IP blocking (v4 + v6).
2. Strip sensitive headers on outbound proxy unless host allowlisted.
3. Separate “user proxy” from “agent browsing” with tiered policies.

### Infrastructure

1. Helmet + CSP + HSTS on API and Next.js.
2. Rate limiting on auth, export, sign-and-send, proxy.
3. Require webhook secrets at boot in production.
4. Restrict `/api/inngest` by network policy.

### Monitoring

1. Alert on `execute_bytes` usage, large transfers, failed Privy verifications, webhook verification failures.
2. Audit log for account merge, wallet registration, permission changes, exports.

---

## 5. Remediation Checklist

Track fixes below. Check off when merged and verified.

### Critical

- [ ] **AUTH-01** — Route `sign-and-send` through approval service or remove `execute_bytes` support
- [ ] **AUTH-02** — Always require user approval for `execute_bytes` in agent flow

### High

- [ ] **AUTH-03** — Verify `privy_wallet_id` ownership via Privy API on `register-wallet`
- [ ] **AUTH-04** — Enforce auth redirect on `/app/*` in middleware + `AppShell`
- [ ] **API-01** — Harden proxy SSRF (redirects, DNS, IPv6, private ranges)
- [ ] **API-02** — Align agent `call_api` SSRF policy with proxy hardening

### Medium

- [ ] **AUTH-05** — Protect logout endpoint (require auth or CSRF token)
- [ ] **AUTH-06** — Fix cookie clearing domain alignment for production
- [ ] **AUTH-07** — Add CSRF protection or Origin validation on mutations
- [ ] **AUTH-08** — Always sync via `fetchAuthMe` before auth redirects
- [ ] **AUTH-09** — Deny-by-default permissions when user row missing
- [ ] **AUTH-10** — Change default `auto_approve_enabled` to `false`
- [ ] **AUTH-12** — Rate limit auth/export endpoints
- [ ] **API-03** — Strip sensitive headers in proxy unless allowlisted
- [ ] **INFRA-01** — Add Helmet, CSP, HSTS
- [ ] **INFRA-02** — Network-restrict Inngest endpoint
- [ ] **FE-02** — Harden artifact preview iframe sandbox + postMessage validation

### Low

- [ ] **AUTH-11** — Log identity-token verification failures
- [ ] **AUTH-13** — Refresh loop detection on `/refresh`
- [ ] **INFRA-03** — Require `PRIVY_WEBHOOK_SIGNING_SECRET` in production
- [ ] **DATA-01** — Step-up auth + audit for `/auth/export`
- [ ] **DATA-02** — Clear chat scope localStorage on logout
- [ ] **FE-01** — URL scheme allowlist for agent markdown links
- [ ] **LOGIC-01** — Alert on email merge conflicts during webhook sync
- [ ] **LOGIC-02** — Audit logging for Privy account transfer webhooks

---

## Appendix — Authentication Architecture (Reviewed)

### Backend flow

| Step | Implementation | Status |
|------|----------------|--------|
| Token extraction | `readAccessTokenFromRequest` → `privy-token` cookie | OK |
| Verification | `PrivyClient.verifyAccessToken` | OK |
| Middleware | `requireAuth` on protected routes | OK |
| User upsert | `GET /auth/me` → `getOrCreateUser` | OK |
| Email uniqueness | `assertNoEmailConflict` → 409 merge | OK |
| Webhooks | Svix signature verification | OK |

### Frontend flow

| Step | Implementation | Status |
|------|----------------|--------|
| Privy provider | HttpOnly cookies, no localStorage tokens | OK |
| OAuth | Whitelabel + CAPTCHA | OK |
| API calls | `apiFetch` with `credentials: "include"` | OK |
| Session refresh | `/refresh` + `sanitizeRedirectPath` | OK |
| Route protection | Middleware partial only | **Gap (AUTH-04)** |
| Logout | Backend + Privy SDK | **Gap (AUTH-05, AUTH-06)** |

### Positive security controls observed

- No custom password auth; Privy handles OTP/OAuth
- Agent wallet resolved from session — not from request body
- Chat/project/session ownership checks via `findSessionForUser` / `assertProjectOwner`
- Privy webhook signature verification (Svix)
- E2B webhook HMAC verification
- Notifications internal API key on ingress
- Open redirect prevented in session refresh (`sanitizeRedirectPath`)
- Client AGENTS.md explicitly forbids token storage in localStorage

---

*Generated by adversarial security review. Re-run after major auth or wallet changes.*
