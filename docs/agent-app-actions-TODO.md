# Agent-controlled app actions — implementation TODO

**North star:** Every Radiant-built app is a **remote control for the user's agent wallet**. The user can click Swap in the generated UI, or tell the agent in chat to act — **same backend path, same Privy agent wallet, same approval rules**. Optional **live mode** animates the UI while the agent works (no full computer use).

**Extends to:** DeepBook first (swap, stake, flash loan, orders, governance), then other protocols (Polymarket, Base, etc.) via the same **action + adapter** pattern.

**References**

- [app-builder-deploy-TODO.md](./app-builder-deploy-TODO.md) — artifacts, preview iframe, `generate_app`
- [app-builder-platform-TODO.md](./app-builder-platform-TODO.md) — explorer install, `call_app` stub
- [deepbook-v3-TODO.md](./deepbook-v3-TODO.md) — `execute_transaction` actions on Sui
- [agent-transaction-history-TODO.md](./agent-transaction-history-TODO.md) — ledger, explorer URLs
- [flash-loan-bundle-TODO.md](./flash-loan-bundle-TODO.md) — flash loan bundle execution
- Backend: `backend/src/services/projects/radiant-client-template.ts`, `project-platform.service.ts`
- Client: `client/src/components/app/ArtifactPreview.tsx`, `client/src/lib/artifact-preview.ts`

**Tracked in:** [backend/docs/TODO.md — Phase 12](../backend/docs/TODO.md)

---

## Architecture (target)

```
Human clicks Swap in generated UI ──┐
Agent says "swap 2 SUI" in chat ────┼──► executeAppAction(action, params)
                                    │         │
                                    │         ├── approval gate (same as chat)
                                    │         ├── Privy agent wallet sign
                                    │         ├── protocol adapter (DeepBook, …)
                                    │         ├── AgentTransaction ledger + digest
                                    │         └── optional: emit live events ──► preview iframe
                                    │
Live mode (optional) ◄──────────────┘     AgentIndicator + __radiantAgent.animate()
```

**Rules**

1. **One execute path** — never duplicate swap/flash logic in UI and chat separately.
2. **Backend commits** — UI animates; chain/db writes happen server-side only.
3. **Semantic actions** — `swap`, `stake`, `flash_loan`, not fragile `#css-selectors` as the primary API.
4. **Preview iframe** — extend existing `postMessage` bridge (`__RADIANT_PREVIEW_FETCH__`), don't assume raw `EventSource` inside srcdoc without parent relay.
5. **Protocol plug-in** — new adapter + schema entries + UI tab; not a new architecture per protocol.

---

## Current state (already shipped)

| Area | Status | Notes |
| ---- | ------ | ----- |
| `generate_app` + artifact preview | ✅ | Chat panel + Projects `/run` |
| Read-only platform APIs | ✅ | `swap/quote`, `deepbook/pool-info` on projects + installations |
| `lib/radiant-client.ts` (quotes only) | ✅ | Auto-injected by `ensure-app-entry.ts` |
| Chat `execute_transaction` + approvals | ✅ | Agent wallet, ledger, explorer links in chat |
| Preview API proxy | ✅ | `__RADIANT_PREVIEW_FETCH__` → parent `fetch` |
| DeepBook agent tools | ✅ | swap, flash loan, stake, orders, governance |
| Prompts: BUILD vs EXECUTE | ✅ | `prompts.ts` — UI build must not call execute unless user trades now |
| Explorer install + installation APIs | ✅ | `/app/installed/:id/run` |
| Action execute from UI | ❌ | No `POST .../actions/*` yet |
| `__radiantAgent` bus | ❌ | Not in template |
| Live SSE / agent stream | ❌ | Not built |
| Per-app action schema | ❌ | Not stored |
| `call_app_action` agent tool | ❌ | Not built |
| `POST /app/:id/call` (external) | ❌ | Phase 7 stub in deploy TODO |

---

## Phase 0 — Design & types

**Goal:** Shared contracts before routes and UI.

**Exit criteria:** Types compile; action names documented; no user-facing change yet.

### 0.1 Action registry (canonical names)

| Status | Task | Detail |
| ------ | ---- | ------ |
| [x] | `AppActionName` union type | `swap`, `flash_loan`, `stake`, `unstake`, `deposit`, `withdraw`, `place_limit_order`, … |
| [x] | Map action → `execute_transaction` `{ action, params }` | `services/projects/app-action-mapper.ts` |
| [x] | Map action → `AgentTransactionCategory` | Reuse `categorize-action.ts` via registry |
| [x] | Document param schemas per action | Zod in `app-action-param-schemas.ts` |

### 0.2 Execute result DTO

| Status | Task | Detail |
| ------ | ---- | ------ |
| [x] | `AppActionResult` type | `{ status: executed \| approval_required \| error, agent_transaction_id?, digest?, pending?, result? }` |
| [x] | Mirror chat `ExecuteToolOutcome` | `app-action-result.ts` — map + round-trip helpers |

### 0.3 Context keys

| Status | Task | Detail |
| ------ | ---- | ------ |
| [x] | `AppActionContext` | `{ privyUserId, projectId?, installationId?, sessionId?, messageId?, source: ui \| agent \| external }` |
| [x] | Correlation | `buildAgentToolOptionsFromContext` → ledger via sessionId/messageId |

---

## Phase 1 — Single backend execute service

**Goal:** `executeAppAction()` wraps existing `runExecuteTransactionToolWithApproval` (or equivalent) — **no new signing path**.

**Exit criteria:** Unit tests call service with mock adapter; returns same outcomes as chat execute.

### 1.1 Core service

| Status | Task | Detail |
| ------ | ---- | ------ |
| [x] | Create `services/projects/app-action.service.ts` | Public: `executeAppAction(ctx, action, params)` |
| [x] | Resolve wallet + permissions | Via existing `runExecuteTransactionToolWithApproval` |
| [x] | Delegate to existing execute pipeline | `runExecuteTransactionToolWithApproval` |
| [x] | Record `AgentTransaction` | Same as chat path (inside approval tool) |
| [x] | Return normalized `AppActionResult` | Include `explorer_url` when digest present |

### 1.2 Project vs installation scope

| Status | Task | Detail |
| ------ | ---- | ------ |
| [x] | `executeAppActionForProject(projectId, …)` | Owner's agent wallet |
| [x] | `executeAppActionForInstallation(installationId, …)` | **Installer's** agent wallet (mirror `swapQuoteForInstallation`) |
| [x] | Auth guards | Same patterns as `project-platform.service.ts` |

### 1.3 Approval from UI

| Status | Task | Detail |
| ------ | ---- | ------ |
| [x] | Return `approval_required` without blocking HTTP | `{ status, pending, agent_transaction_id }` via `AppActionResult` |
| [x] | UI bridge for approve | `ArtifactPreviewWithApproval` + `useAgentTransactionApproval` + `TransactionApprovalBar` on run pages / artifact panel |
| [x] | `POST /api/v1/agent/transactions/:id/approve` + `/reject` | UI path without chat session; chat still uses `POST /chat` with `approve_transaction_id` |

### 1.4 Tests

| Status | Task | Detail |
| ------ | ---- | ------ |
| [ ] | Unit: action mapper Zod validation | Invalid params rejected before execute |
| [ ] | Unit: maps `swap` → `execute_transaction` input | |
| [ ] | Integration: project-scoped swap (mock sign) | |

---

## Phase 2 — HTTP routes

**Goal:** Generated apps and external callers hit REST, not chat.

**Exit criteria:** `curl` with session cookie can quote + execute swap on a saved project.

### 2.1 Project routes

| Status | Task | Detail |
| ------ | ---- | ------ |
| [x] | `POST /api/v1/projects/:projectId/actions/:actionName` | Body = action params JSON |
| [x] | `GET /api/v1/projects/:projectId/actions` | List supported actions + param field docs (full registry until Phase 6) |
| [x] | Register in `api/routes/v1/projects/projects.ts` | |
| [ ] | Rate limit per user | No HTTP rate-limit middleware yet — defer until shared limiter exists |

### 2.2 Installation routes

| Status | Task | Detail |
| ------ | ---- | ------ |
| [x] | `POST /api/v1/installations/:installationId/actions/:actionName` | |
| [x] | `GET /api/v1/installations/:installationId/actions` | |
| [x] | Register in `installations.ts` | |

### 2.3 DeepBook actions (MVP set)

| Status | Action | Maps to |
| ------ | ------ | ------- |
| [x] | `swap` | `execute_transaction` swap / deepbook_swap |
| [x] | `flash_loan` | deepbook_flash_loan (+ quote validation) |
| [x] | `stake` | deepbook_stake |
| [x] | `unstake` | deepbook_unstake |
| [x] | `deposit` | deepbook_deposit |
| [x] | `withdraw` | deepbook_withdraw |
| [x] | `place_limit_order` | deepbook_place_limit_order |
| [x] | `cancel_order` | deepbook_cancel_order |

### 2.4 API docs

| Status | Task | Detail |
| ------ | ---- | ------ |
| [x] | Update `backend/api-ref.md` | Routes + example bodies |
| [x] | Envelope `{ success, data, error }` | Standard Radiant response |

---

## Phase 3 — Extend `radiant-client.ts`

**Goal:** Generated apps call execute helpers; human clicks use agent wallet.

**Exit criteria:** Swap button in a test artifact calls backend and returns digest or approval.

### 3.1 Template updates (`radiant-client-template.ts`)

| Status | Task | Detail |
| ------ | ---- | ------ |
| [x] | `executeAction(action, params)` | `POST .../actions/:action` |
| [x] | `executeSwap(params)` | Convenience wrapper |
| [x] | `executeFlashLoan(params)` | |
| [x] | `executeStake` / `executeUnstake` | |
| [x] | Handle `approval_required` in client | Returns discriminated union; `isApprovalRequired()` helper; throws `RadiantActionError` on `error` |
| [x] | Support installation id | Read `__RADIANT_INSTALLATION_ID__` when present |

### 3.2 Preview bootstrap (`artifact-preview.ts`)

| Status | Task | Detail |
| ------ | ---- | ------ |
| [x] | Inject `__RADIANT_INSTALLATION_ID__` when running installed app | Mirror project id injection |
| [x] | Route action POSTs through `__RADIANT_PREVIEW_FETCH__` | Already proxies to parent |

### 3.3 `ensure-app-entry.ts`

| Status | Task | Detail |
| ------ | ---- | ------ |
| [x] | Bump template version comment | `RADIANT_CLIENT_TEMPLATE_VERSION = 3` |
| [x] | Integration test: generated artifact includes execute helpers | `generate-app.test.ts` + `ensure-app-entry.test.ts` |

---

## Phase 4 — Generated app agent runtime (`__radiantAgent`)

**Goal:** Every app registers handlers; supports silent + animated execution.

**Exit criteria:** Demo app registers `swap`; `__radiantAgent.execute('swap', params, { animate: true })` runs handler.

### 4.1 Runtime module (new template file)

| Status | Task | Detail |
| ------ | ---- | ------ |
| [x] | Add `lib/radiant-agent-runtime.ts` to template | Auto-injected like radiant-client |
| [x] | `window.__radiantAgent.register(action, handler)` | Handler: `(params, ctx) => Promise<void>` |
| [x] | `window.__radiantAgent.execute(action, params, opts?)` | animate → local handler; always → `executeAction` API |
| [x] | `ctx.animate`, `ctx.highlight(targetId)` | For live mode |

### 4.2 UI components (template)

| Status | Task | Detail |
| ------ | ---- | ------ |
| [x] | `components/AgentIndicator.tsx` | Floating pill when agent active |
| [x] | `components/AgentOverlay.tsx` or hook `useRadiantAgent()` | `useRadiantAgent` + `AgentIndicator` in template |
| [x] | CSS in `app/globals.css` | `.agent-focused`, `.agent-clicking`, indicator pill |
| [x] | `data-radiant-id` convention | Documented in prompts + SwapForm scaffold |

### 4.3 Codegen guidance (`prompts.ts` + generate_app)

| Status | Task | Detail |
| ------ | ---- | ------ |
| [x] | Prompt: SwapForm registers `swap` on mount | |
| [x] | Prompt: buttons call `__radiantAgent.execute` or `executeSwap` | Not raw SDK |
| [x] | Prompt: add `data-radiant-id` on interactive elements | |
| [x] | Example scaffold in `template: swap` | `SWAP_FORM_SCAFFOLD` when template swap and no SwapForm |

### 4.4 Tests

| Status | Task | Detail |
| ------ | ---- | ------ |
| [x] | Unit: runtime register + execute dispatches | `radiant-agent-runtime.factory.test.ts` |
| [ ] | Manual: artifact preview swap button → approval or digest | |

---

## Phase 5 — Preview parent bridge (actions + future stream)

**Goal:** Iframe apps stay sandbox-safe; parent forwards API and agent events.

**Exit criteria:** Action execute works in iframe preview identically to Projects run page.

### 5.1 Action POST relay

| Status | Task | Detail |
| ------ | ---- | ------ |
| [x] | Verify `__RADIANT_PREVIEW_FETCH__` handles `POST .../actions/*` | `artifact-preview-bridge.ts` + unit tests |
| [x] | `ArtifactPreview.tsx` installation path rewrite | `rewritePreviewApiPath` shared helper |

### 5.2 Agent event relay (prep for Phase 8)

| Status | Task | Detail |
| ------ | ---- | ------ |
| [x] | Define `radiant-agent-event` postMessage type | `RadiantAgentStreamEvent` in `artifact-preview-bridge.ts` |
| [x] | Parent listener forwards SSE events → iframe | `usePreviewAgentEventRelay` placeholder hook |
| [x] | Iframe runtime listens for `radiant-agent-event` | `handleExternalEvent` in `radiant-agent-runtime.ts` |

### 5.3 Session ↔ preview linking

| Status | Task | Detail |
| ------ | ---- | ------ |
| [x] | `ActivePreviewSession` registry (client) | `active-preview-session.ts` |
| [x] | Pass `session_id` on action execute from UI | `X-Radiant-Session-Id` header on action POSTs; backend `readAppActionSessionId` |

---

## Phase 6 — Action schema per project

**Goal:** Agent discovers what an app can do without reading React source.

**Exit criteria:** `GET .../actions` returns JSON Schema; agent tool reads it.

### 6.1 Storage

| Status | Task | Detail |
| ------ | ---- | ------ |
| [x] | Prisma: `Project.action_schema` JSONB nullable | Or separate `ProjectActionSchema` table |
| [x] | Migration | |
| [x] | Default schema for DeepBook swap apps | Generated on `generate_app` when template hints DeFi |

### 6.2 Schema shape

```typescript
{
  app_id: string;
  protocol: "deepbook" | "custom";
  actions: Array<{
    name: string;
    description: string;
    params: Array<{ name: string; type: string; required?: boolean }>;
  }>;
}
```

| Status | Task | Detail |
| ------ | ---- | ------ |
| [x] | `buildDefaultDeepBookActionSchema()` | swap, stake, flash_loan, … |
| [x] | Persist on `generate_app` when DeFi UI detected | Heuristic: imports radiant-client execute or component names |
| [x] | `GET /projects/:id/actions` returns schema | |
| [x] | Version field for schema migrations | `schema_version: 1` |

### 6.3 Agent discovery

| Status | Task | Detail |
| ------ | ---- | ------ |
| [x] | `query_chain` → `project_actions` optional query | Or include in `list_session_projects` |
| [x] | System prompt: use schema before `call_app_action` | |

---

## Phase 7 — Agent tool: `call_app_action`

**Goal:** Chat agent executes app actions silently (same as UI click).

**Exit criteria:** User says "swap 2 SUI in my DEX project" → agent calls tool → tx via agent wallet.

### 7.1 Tool definition

| Status | Task | Detail |
| ------ | ---- | ------ |
| [x] | `call_app_action.tool.ts` | `{ project_id?, installation_id?, action, params }` |
| [x] | Register in `tools.ts` | |
| [x] | Run → `executeAppAction` | |

### 7.2 Prompts (`prompts.ts`)

| Status | Task | Detail |
| ------ | ---- | ------ |
| [x] | When user references open project / saved DEX | Prefer `call_app_action` over raw execute when project context known |
| [x] | Still allow direct `execute_transaction` | For chat-only trades without a project |
| [x] | BUILD vs ACT split preserved | Build UI ≠ execute unless user asks to trade |

### 7.3 Workflow planner

| Status | Task | Detail |
| ------ | ---- | ------ |
| [x] | Step kind `app_action` optional | `{ kind: "app_action", project_id, action, params }` |
| [x] | Or map to agent step with explicit tool call | Planner `project_id` / `installation_id` → `app_action` step → `call_app_action` |

### 7.4 Tests

| Status | Task | Detail |
| ------ | ---- | ------ |
| [ ] | Unit: tool validates against schema | |
| [ ] | Integration: call_app_action swap | |

---

## Phase 8 — Live mode (SSE + animation)

**Goal:** User watches agent fill forms / highlight buttons while backend executes.

**Exit criteria:** Chat "swap 2 SUI" with artifact open shows AgentIndicator + animated swap form; digest on done.

### 8.1 Backend stream

| Status | Task | Detail |
| ------ | ---- | ------ |
| [ ] | `GET /api/v1/chat/sessions/:sessionId/agent-stream` | SSE (Hono/Express stream) |
| [ ] | `emitAgentEvent(sessionId, event)` | In-memory Map for dev |
| [ ] | Production: Redis pub/sub channel per session | Document in Production picker |
| [ ] | Event types | `agent_thinking`, `agent_action`, `agent_step`, `agent_done`, `agent_error` |

### 8.2 Emit during execution

| Status | Task | Detail |
| ------ | ---- | ------ |
| [ ] | Hook in `executeAppAction` | If stream subscriber + `broadcast: true` |
| [ ] | Hook in chat `execute_transaction` when preview linked | Same events for chat-only agent path |
| [ ] | Semantic events first | `{ type: agent_action, action: swap, params, animate: true }` |
| [ ] | Optional fine-grained steps | `{ type: agent_step, target: amount-in, value: 2 }` |

### 8.3 Client SSE consumer

| Status | Task | Detail |
| ------ | ---- | ------ |
| [ ] | `useAgentStream(sessionId)` in Radiant shell | ChatView or ArtifactContext |
| [ ] | Forward to iframe via postMessage | Phase 5.2 |
| [ ] | `__radiantAgent` handles events | animate → registered handler UI only |

### 8.4 Ordering guarantee

| Status | Task | Detail |
| ------ | ---- | ------ |
| [ ] | Document: animation may lead/lag tx by ~300ms | Backend is source of truth |
| [ ] | `agent_done` includes digest + refresh flag | UI refetches quotes/balances |

### 8.5 Tests

| Status | Task | Detail |
| ------ | ---- | ------ |
| [ ] | Integration: emit + SSE client receives | |
| [ ] | Manual demo script | |

---

## Phase 9 — In-app approval UX

**Goal:** When UI triggers `approval_required`, user can approve without switching to chat.

**Exit criteria:** Swap from generated app shows approval UI; approve completes action.

### 9.1 Options (pick one in implementation)

| Option | Description |
| ------ | ----------- |
| A | Global Radiant modal (reuse `TransactionApprovalBar` at app shell level) |
| B | In-iframe modal via postMessage to parent |
| C | Redirect focus to chat with pending tx |

| Status | Task | Detail |
| ------ | ---- | ------ |
| [ ] | Decision recorded in this doc | |
| [ ] | Implement chosen path | |
| [ ] | `approval_required` from action API opens modal | |
| [ ] | Approve calls existing `approvePendingTransaction` | |

---

## Phase 10 — Protocol extension kit

**Goal:** Adding Polymarket / Base / etc. follows a checklist, not a rewrite.

**Exit criteria:** Doc section + one stub adapter proves pattern.

### 10.1 Adapter interface

| Status | Task | Detail |
| ------ | ---- | ------ |
| [ ] | `AppProtocolAdapter` interface | `supportedActions()`, `execute(action, params, ctx)` |
| [ ] | `DeepBookAppAdapter` implements | Wraps existing defi services |
| [ ] | Registry: `protocol` field on project | `deepbook`, `polymarket`, … |

### 10.2 Per-protocol checklist (template for new protocols)

| Status | Task | Detail |
| ------ | ---- | ------ |
| [ ] | Backend adapter in `services/defi/` or `services/protocols/` | |
| [ ] | Action mapper entries | |
| [ ] | Default action schema | |
| [ ] | `radiant-client` helpers | |
| [ ] | generate_app prompt blurb | |
| [ ] | Agent tool / execute_transaction actions if chain-specific | |

### 10.3 DeepBook full UI coverage

| Status | Task | Detail |
| ------ | ---- | ------ |
| [ ] | Swap tab wired end-to-end | Phase 1–4 |
| [ ] | Flash loan tab | quote + execute actions |
| [ ] | Stake / governance tabs | |
| [ ] | Open orders view | read via existing query APIs in client |

---

## Phase 11 — External agents & Walrus deploy

**Goal:** Installed/public apps callable outside Radiant chat; deployed UI uses same runtime.

**Exit criteria:** `POST /api/v1/apps/:id/call` documented; Walrus-hosted app uses Radiant API base URL.

### 11.1 External call endpoint

| Status | Task | Detail |
| ------ | ---- | ------ |
| [ ] | `POST /api/v1/apps/:id/call` | `{ action, params }` + auth |
| [ ] | Maps to installation execute path | |
| [ ] | API key or session auth for third-party agents | Future |

### 11.2 Deployed app config

| Status | Task | Detail |
| ------ | ---- | ------ |
| [ ] | Store `api_endpoint` + action schema in project metadata | Not Walrus-only blob required for MVP |
| [ ] | Walrus deploy injects `NEXT_PUBLIC_RADIANT_API_URL` | build-time or runtime config |
| [ ] | CORS for Walrus origin → Radiant API | |

### 11.3 Explorer / install alignment

| Status | Task | Detail |
| ------ | ---- | ------ |
| [ ] | Update `app-builder-platform-TODO` workstream 5 | Mark `call_app` when done |
| [ ] | Explorer app detail: list available actions | |

---

## Phase 12 — Testing matrix

| Test | Type | Phase |
| ---- | ---- | ----- |
| Action mapper validation | unit | 0–1 |
| executeAppAction → mock sign | integration | 1 |
| POST project actions/swap | integration | 2 |
| radiant-client executeSwap | unit | 3 |
| __radiantAgent register/execute | unit | 4 |
| Preview iframe action POST | manual / e2e | 5 |
| GET action schema | integration | 6 |
| call_app_action tool | integration | 7 |
| SSE agent-stream | integration | 8 |
| UI approval modal | manual | 9 |
| Full: build DEX → click swap → digest | e2e | 1–4 |
| Full: chat swap with live animation | e2e | 8 |

---

## Phase 13 — Documentation & prompts cleanup

| Status | Task | Detail |
| ------ | ---- | ------ |
| [ ] | Update `prompts.ts` — BUILD apps must wire buttons to radiant-client execute | After Phase 3 |
| [ ] | Update `client/AGENTS.md` | Agent-controlled apps section |
| [ ] | Update `backend/AGENTS.md` or radiant-backend skill | |
| [ ] | README architecture diagram | Optional |
| [ ] | Mark completed phases in this doc | Ongoing |

---

## Recommended build order

```text
Phase 0 (types)
    └── Phase 1 (executeAppAction service)
            └── Phase 2 (HTTP routes)
                    └── Phase 3 (radiant-client execute)
                            └── Phase 4 (__radiantAgent runtime)
                                    ├── Phase 5 (preview bridge) — parallel with 4
                                    ├── Phase 6 (action schema)
                                    ├── Phase 7 (call_app_action tool)
                                    ├── Phase 9 (in-app approval) — after 2–3
                                    └── Phase 8 (live SSE) — after 5 + 7
                                            └── Phase 10 (protocol kit)
                                                    └── Phase 11 (external + Walrus)
```

**Minimum demo (MVP):** Phases **0 → 1 → 2 → 3 → 4** = build Uniswap-like UI, click Swap, agent wallet signs.

**Full vision:** Add **6, 7, 8** for agent-driven + live animation.

---

## Production picker — what to use where

| Component | Dev / MVP | Production |
| --------- | --------- | ---------- |
| `activeStreams` Map (SSE) | In-memory on single Node process | Redis pub/sub + sticky session or user channel |
| Agent event broadcast | Best-effort; skip if no listener | Same; don't fail execute if stream down |
| Action schema | JSONB on `Project` | Same; validate on write |
| Preview postMessage | `*` origin in dev | Narrow target origin in prod |

---

## FAQ

**Does the generated app use MetaMask?**  
No. Session cookies + Radiant backend + **Privy agent wallet** — same as chat.

**Can the agent still use `execute_transaction` directly?**  
Yes. `call_app_action` is for project-scoped UX; raw execute remains for chat-only trades.

**Walrus vs Radiant preview?**  
MVP runs in Radiant iframe. Walrus hosts static shell; API calls still go to Radiant backend (Phase 11).

**Live mode without SSE?**  
Fallback: chat execution timeline + receipts only (already shipped in chat).

---

## Changelog

| Date | Phase | Notes |
| ---- | ----- | ----- |
| 2026-06-14 | 5 | Preview bridge: API proxy helper, agent events, session header, ActivePreviewSession |
| 2026-06-14 | 4 | `__radiantAgent` runtime, AgentIndicator, swap scaffold, codegen prompts |
| 2026-06-14 | 3 | `radiant-client` v3: `executeAction`, swap/flash/stake helpers, installation id, preview injection |
| 2026-06-14 | 2 | HTTP routes: project + installation `GET/POST .../actions`, catalog service, api-ref |
| 2026-06-14 | 1.3 | UI approval: `POST .../agent/transactions/:id/approve|reject`, `ArtifactPreviewWithApproval`, `useAgentTransactionApproval` |
| 2026-06-14 | 0.2–1.2 | `AppActionResult`, `AppActionContext`, `app-action.service.ts`, result mappers + tests |
| 2026-06-14 | 0.1 | Action registry: `app-action.types`, `app-action-registry`, `app-action-param-schemas`, `app-action-mapper` + unit tests |
| 2026-06-14 | — | Initial doc created from architecture review |
