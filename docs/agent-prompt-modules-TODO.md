# Agent prompt modules — implementation TODO

Modular system prompts for Radiant: **personality and platform core** stay small and always-on; **protocol-specific guidance** (DeepBook, future Soroswap / Stella / Lefi / ramps) loads only when relevant. Replaces the monolithic `const lines = [...]` in `backend/src/services/agent/runtime/prompts.ts`.

**Related docs**

- Current monolith: `backend/src/services/agent/runtime/prompts.ts`
- Provider registry (today): `backend/src/services/defi/deepbook/swap-registry.ts`
- Client API catalog pattern: `backend/src/services/projects/radiant-client-api-catalog.ts`
- Pinned app conditional prompt: `backend/src/services/projects/pinned-app-scope.types.ts`
- Intent helpers: `backend/src/services/agent/execution-intent.ts`, `backend/src/services/agent/deepbook/flash-loan-turn-intent.ts`

**MVP principle:** Phase 1–2 must **not change agent behavior** — same full prompt output as today. Scoped injection rolls out behind `PROMPT_SCOPE_MODE=full|scoped` (default `full` until validated).

**Explicitly deferred (separate planning doc — do not implement here)**

- Cross-chain / multi-hop routing (`route_quote`, LiFi + Stellar double-bridge, capability graph, session route stickiness)
- See future: `docs/cross-chain-routing-TODO.md` (not created yet)

---

## Product behavior (target)

| Scenario | Expected prompt modules |
| -------- | ----------------------- |
| “What is DeepBook?” (research) | `core:personality`, `core:tool-routing`, `core:errors`, `chain:sui`, `protocol:deepbook:env` |
| “Swap 10 SUI to USDC” | core + chain + `protocol:deepbook:swap` (+ env for pool defaults) |
| “Open a margin position on SUI_USDC” | core + chain + `protocol:deepbook:margin` (not predict, not artifact build) |
| “Build a swap UI like Uniswap” | core + `artifact:build`, `artifact:defi-ui` (not margin) |
| User pins saved app + “make the button blue” | core + `artifact:edit` + pinned scope block (existing) |
| “Remind me at 3pm” | core + `platform:notifications` |
| Future: “Swap on Soroswap” | core + chain + `protocol:soroswap:swap` only |

### Explicitly out of scope (this doc)

- Cross-chain route planner and `core:cross-chain-routing`
- Tool definition filtering (optional phase 6 — all tools remain registered until then)
- Streaming / multi-model prompt variants
- Client-side prompt editing

---

## Architecture (target)

```text
services/agent/prompts/
    types.ts                    PromptModuleId, PromptBuildContext, PromptModule
    registry.ts                 PROMPT_MODULES map + canonical order
    resolve-modules.ts          select modules per turn (scoped mode)
    action-module-map.ts        execute action / query_type → module ids
    index.ts                    buildSystemPrompt() — composer

    core/
        personality.ts          Radiant identity, research / execution / build
        tool-routing.ts           query_chain vs execute vs call_app_action (generic)
        permissions.ts            auto-approve, flash loan, governance lines
        errors.ts                 error replies, agent_transactions history

    chains/
        sui.ts                    chain defaults (no DeepBook param detail)

    protocols/
        deepbook/
            env.ts                pools, env, market data queries
            swap.ts
            balance.ts            deposit, withdraw, provision manager
            orders.ts
            flash-loan.ts
            stake.ts
            governance.ts
            margin.ts               includes MARGIN_RADIANT_ID_GUIDE
            predict.ts
        soroswap/                 stub until backend exists
            swap.ts
        stella/                   stub
            lending.ts
        lefi/                     stub
            ...

    fiat/                         stub until ramp backend exists
        on-ramp.ts
        off-ramp.ts

    artifacts/
        build.ts                  generate_app scaffold rules
        edit.ts                   edit_app surgical rules
        defi-ui.ts                swap UI wiring, data-radiant-id, handlers

    platform/
        notifications.ts
        browsing.ts               web_search, call_api, external APIs in apps
        explorer.ts               deploy, install, publish, marketplace

services/agent/runtime/prompts.ts   thin re-export → prompts/index.ts (backward compat)
```

**Composition rule:** `buildSystemPrompt` joins modules in registry order, then appends pinned scope, artifact context, and user memory (unchanged).

---

## Phase 0 — Prep and safety net

| Status | Task |
| ------ | ---- |
| [x] | Add snapshot test: `buildSystemPrompt()` output hash or normalized line count matches pre-refactor baseline (`tests/unit/agent/prompts-baseline.test.ts`) |
| [x] | Document env flag `PROMPT_SCOPE_MODE` in `backend/.env.example`: `full` (default) \| `scoped` |
| [x] | Extend existing `prompts-call-app-action.test.ts` to assert key routing strings still present after each phase |

---

## Phase 1 — Personality and core first (priority)

Extract **venue-agnostic** content from `prompts.ts` into `services/agent/prompts/core/`. No scoped injection yet — composer still loads everything, but core is isolated and reviewable.

| Status | Task | Source lines (approx) |
| ------ | ---- | --------------------- |
| [x] | Create `prompts/types.ts` — `PromptModuleId`, `PromptBuildContext`, `PromptModule`, `PromptLayer` | Design doc |
| [x] | Create `prompts/core/personality.ts` | L64–65, L66, L139 (thread context) |
| [x] | Create `prompts/core/tool-routing.ts` — generic tool choice, workflow/clarification, approval-in-chat rules | L72, L85–87, L95 |
| [x] | Create `prompts/core/permissions.ts` — move `approvalLines`, `flashLoanLine`, `governanceLine` builders | L44–61, L70–71 |
| [x] | Create `prompts/core/errors.ts` — tool errors, multi-part answers, `agent_transactions` | L94–95 |
| [x] | Create `prompts/registry.ts` — register core modules with `order` 0–99 |
| [x] | Create `prompts/index.ts` — `buildSystemPrompt` calls core modules + **temporary** `legacyRestLines()` until Phase 2 splits the remainder |
| [x] | Re-export from `runtime/prompts.ts` for backward compatibility |
| [x] | Unit tests: core modules contain research/execution/build keywords; core modules do **not** contain `deepbook_margin`, `pool_key`, `generate_app` |

**Personality module must include (checklist)**

- [x] “You are Radiant…” identity
- [x] RESEARCH vs EXECUTION vs BUILD decision tree (hypotheticals = research)
- [x] Always complete reply after tools
- [x] Wallet from session — never ask for agent wallet address
- [x] Thread-only context / user memory block handling (memory still appended in composer, not inside personality file)

**Core must NOT include**

- DeepBook pool keys, margin, predict, flash loan param shapes
- `generate_app` / `edit_app` detail
- Soroswap / Stella / Lefi / ramp instructions

---

## Phase 2 — Split remaining monolith into modules (behavior unchanged)

Move every remaining line from `prompts.ts` into typed modules. Composer loads **all** modules in `full` mode.

| Status | Module | Content to extract |
| ------ | ------ | ------------------ |
| [x] | `chains/sui.ts` | `Default chain`, dynamic DeepBook env one-liner can move to `deepbook/env` instead |
| [x] | `protocols/deepbook/env.ts` | L74–75, pool/ticker/volume queries |
| [x] | `protocols/deepbook/balance.ts` | L76–80, provision manager |
| [x] | `protocols/deepbook/swap.ts` | L81–83, L88, chat vs app swap routing |
| [x] | `protocols/deepbook/orders.ts` | L89–90, L121 |
| [x] | `protocols/deepbook/flash-loan.ts` | L91 |
| [x] | `protocols/deepbook/stake.ts` | L92 |
| [x] | `protocols/deepbook/governance.ts` | L93 |
| [x] | `protocols/deepbook/margin.ts` | L122–133, `MARGIN_RADIANT_ID_GUIDE` |
| [x] | `protocols/deepbook/predict.ts` | L134–138 |
| [x] | `artifacts/build.ts` | L84, L96–98, L101–103, L118 |
| [x] | `artifacts/edit.ts` | L99–100 |
| [x] | `artifacts/defi-ui.ts` | L105–111, live quotes, radiant-agent handlers |
| [x] | `platform/notifications.ts` | L117 |
| [x] | `platform/browsing.ts` | L112–114, L115–116 (app data + shared data split or sub-modules) |
| [x] | `platform/explorer.ts` | L119–120 |
| [x] | Wire `formatRadiantClientApiGuideForPrompt()` inside `artifacts/defi-ui` or dedicated `artifacts/radiant-client.ts` | L106 |
| [x] | Delete `legacyRestLines()` — composer uses registry only |
| [x] | Baseline test still passes (byte-identical or documented intentional diffs) |

---

## Phase 3 — Module registry and action mapping

| Status | Task |
| ------ | ---- |
| [ ] | Create `prompts/action-module-map.ts` — map `execute_transaction` actions + `query_chain` types → `PromptModuleId[]` (use `classify-execute-action.ts` groupings as reference) |
| [ ] | Add `PromptTrigger` on each module: `keywords`, `executeActions`, `queryTypes`, `requiresPermission`, `chains` |
| [ ] | Export `ALL_MODULE_IDS` and `CORE_MODULE_IDS` from registry |
| [ ] | Unit tests per map entry (e.g. `deepbook_margin_borrow` → margin module only) |

---

## Phase 4 — Scoped resolution (`resolvePromptModules`)

| Status | Task |
| ------ | ---- |
| [ ] | Create `prompts/resolve-modules.ts` — union of: always-core, chain module, keyword triggers, `detectInstructionMode`, `classifyFlashLoanTurnIntent`, `parseSwapExecutionIntent`, pinned app hints |
| [ ] | Extend `BuildSystemPromptInput` with optional `userMessage`, `activeModuleIds`, `knownAppActions`, `mode?: 'full' \| 'scoped'` |
| [ ] | `buildSystemPrompt`: if `mode !== 'full'`, compose selected modules only; else all modules (parity) |
| [ ] | Compound messages: union modules from workflow planner step actions (`workflow/planner-prompt.ts` action list) |
| [ ] | Safety widen: ambiguous execution messages include default swap module for active chain |
| [ ] | Unit tests: swap message excludes margin; margin message excludes predict; build message includes artifact modules not deepbook margin |

---

## Phase 5 — Runtime wiring

| Status | Task |
| ------ | ---- |
| [ ] | Extend `AgentTurnInput` in `runtime/types.ts` with `promptContext` (userMessage, activeModuleIds, mode) |
| [ ] | `chat-orchestrator.ts` — pass last user message + read `PROMPT_SCOPE_MODE` from env |
| [ ] | `openai.runtime.ts` — forward `promptContext` to `buildSystemPrompt` |
| [ ] | `error-explanation.ts` — pass same module set as failing turn (or `full` on compound errors) |
| [ ] | `workflow-runner.ts` — optional: pass workflow-derived module ids for agent steps |

---

## Phase 6 — Session stickiness (optional, post-scoped validation)

| Status | Task |
| ------ | ---- |
| [ ] | Derive `activeModuleIds` from tool calls after each turn (`swap_quote` → deepbook swap, etc.) |
| [ ] | Persist on `ChatSession` JSON column or in-memory for MVP (`session_prompt_modules`) |
| [ ] | Load sticky modules on next turn so “do it” / “retry” retains protocol context |
| [ ] | Clear sticky modules on explicit venue switch or new chat |

---

## Phase 7 — Provider registry alignment (prep for Soroswap / Stella / Lefi / ramps)

Extend `swap-registry.ts` → `defi/provider-registry.ts` (names TBD). **Prompt modules only** in this phase — no new execute paths required.

| Status | Task |
| ------ | ---- |
| [ ] | Define `DeFiProviderId` union with future ids: `sui-soroswap`, `sui-stella`, `sui-lefi` (disabled until backend) |
| [ ] | Each provider entry lists `promptModules: PromptModuleId[]` |
| [ ] | Stub modules under `protocols/soroswap/`, `stella/`, `lefi/` with placeholder “not enabled” one-liners — **not injected** when provider disabled |
| [ ] | Stub `fiat/on-ramp.ts`, `fiat/off-ramp.ts` — triggered by keywords only when `FIAT_RAMP_ENABLED=true` |
| [ ] | `resolvePromptModules`: if user names provider (“Soroswap”), select that provider’s modules; else default swap provider (`sui-deepbook`) |
| [ ] | Split `radiant-client-api-catalog.ts` by provider when adding Soroswap/Stella exports (mirror prompt modules) |

---

## Phase 8 — Enable scoped mode in production

| Status | Task |
| ------ | ---- |
| [ ] | Run eval suite / manual matrix: swap, deposit, margin research, build UI, edit artifact, notifications, flash loan research vs execution |
| [ ] | Compare token counts: scoped vs full (log in dev) |
| [ ] | Flip default `PROMPT_SCOPE_MODE=scoped` in staging |
| [ ] | Monitor wrong-tool regressions (swap calling margin actions, etc.) |
| [ ] | Remove monolith dead code; keep `runtime/prompts.ts` as re-export only |

---

## Testing matrix

| Test file | Covers |
| --------- | ------ |
| `tests/unit/agent/prompts-baseline.test.ts` | Full mode output parity |
| `tests/unit/agent/prompts-core.test.ts` | Personality isolation |
| `tests/unit/agent/prompts-resolve-modules.test.ts` | Scoped selection |
| `tests/unit/agent/prompts-call-app-action.test.ts` | Existing routing strings |
| `tests/unit/agent/prompts-deepbook-swap.test.ts` | Swap module only |

Manual smoke (before scoped prod):

- [ ] Research question with amount — no execute
- [ ] Chat-only swap — swap_quote + execute
- [ ] Pinned app swap — call_app_action
- [ ] generate_app then edit_app follow-up
- [ ] Margin provision flow — pool picker question
- [ ] Flash loan strategy question — quote only, no execute

---

## Implementation order (summary)

1. **Phase 0** — baseline tests + env flag ✅
2. **Phase 1** — **personality + core** (your priority) ✅
3. **Phase 2** — split DeepBook / artifacts / platform into modules (still full mode)  
4. **Phase 3** — registry + action map  
5. **Phase 4** — scoped resolver  
6. **Phase 5** — orchestrator + runtime wiring  
7. **Phase 6** — session stickiness (optional)  
8. **Phase 7** — provider stubs for Soroswap / Stella / Lefi / ramps  
9. **Phase 8** — enable scoped mode  

**Not in this list:** cross-chain routing — track separately when LiFi / multi-hop design is ready.

---

## File touch list (expected)

| Area | Files |
| ---- | ----- |
| New | `backend/src/services/agent/prompts/**` |
| Modify | `backend/src/services/agent/runtime/prompts.ts`, `openai.runtime.ts`, `runtime/types.ts`, `chat-orchestrator.ts`, `error-explanation.ts` |
| Modify | `backend/src/services/defi/deepbook/swap-registry.ts` (or successor provider registry) |
| Config | `backend/.env.example`, `backend/src/config/agent.ts` (optional prompt mode) |
| Tests | `backend/tests/unit/agent/prompts-*.test.ts` |
