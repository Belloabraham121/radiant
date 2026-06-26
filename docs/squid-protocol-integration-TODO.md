# Squid Protocol integration — Li-Fi fallback with user consent

Cross-chain **swap and bridge** liquidity fallback: **Li-Fi remains primary**; when Li-Fi has no route/liquidity, Radiant offers the user an **opt-in** retry via **Squid** (`@0xsquid/sdk`). Agent tools stay unchanged (`cross_chain_quote`, `cross_chain_routes`, `cross_chain_swap`).

**References**

- Squid docs: [docs.squidrouter.com](https://docs.squidrouter.com/getting-started/readme)
- Squid SDK: [@0xsquid/sdk](https://www.npmjs.com/package/@0xsquid/sdk)
- Squid API base: `https://v2.api.squidrouter.com/v2/`
- Radiant Li-Fi pattern: `backend/src/services/defi/lifi/` (mirror layout)
- Parent doc: [defi-providers-integration-TODO.md](./defi-providers-integration-TODO.md)

**Design principles**

1. **SDK-first** — `@0xsquid/sdk` in `services/defi/squid/` only; no SDK in `src/api/`.
2. **No silent fallback** — user must confirm before Squid is queried or executed.
3. **Same agent tools** — no `squid_*` top-level agent tools; provider is internal.
4. **Privy signing only** — server never holds private keys; map Squid `executeRoute` to Privy viem / Mysten / Solana signers (same as Li-Fi).
5. **Allowlist first** — reject out-of-scope chains/tokens before any Squid HTTP call.
6. **Squid Intents** — `quoteId` is **required** on status polling; failing to poll can fail the tx.

**Network:** Mainnet first. Squid chain ids are **strings** (`"8453"`, `"sui-mainnet"`, `"solana-mainnet-beta"`).

---

## Product behavior

| Scenario | Expected behavior |
| -------- | ----------------- |
| User bridges/swaps; Li-Fi returns routes | Unchanged — Li-Fi quote → approval → execute → stream steps |
| Li-Fi returns **no routes** at quote time (agent or intent fast path) | Do **not** show hard “no liquidity” error immediately. Emit `liquidity_fallback_offered` → timeline step **“Finding another route…”** → consent dialog |
| Consent dialog copy (short) | “Li-Fi couldn’t find liquidity for this transfer. Check another route provider?” **Yes / No** — do not name Squid to the user in v1 copy |
| User taps **Yes** | Backend calls Squid SDK `getRoute` → new approval dialog with Squid route → execute → stream steps (submit → swapping → complete) |
| User taps **No** | Cancel cleanly; agent message explains transfer wasn’t submitted; no Squid API call |
| Li-Fi route **expires** or re-quote fails at execute/approval time | Same fallback offer (not a stale-route dead end if Squid may work) |
| Same-chain swap via Li-Fi path (`swap-lifi-execute`) with no routes | Same consent + Squid retry |
| Bridge intent fast path (`bridge-execute`) with no routes | Same consent + Squid retry |
| Squid also has no route | User-facing: “No routes available right now” — suggest different token, amount, or chain |
| Stellar-only flows | **No Squid** — Soroswap only; Squid Stellar support is out of v1 scope unless explicitly enabled later |
| DeepBook Sui same-chain swap | **Unchanged** — no Squid |

### UX: execution timeline states

| Step id (proposed) | Label | When |
| ------------------ | ----- | ---- |
| `quote` / existing | Resolving route… | Li-Fi quote in progress |
| `liquidity-check` | Checking liquidity… | Li-Fi returned empty or `LIFI_NO_ROUTE` |
| `fallback-offer` | Finding another route… | Waiting for user consent (running/pending) |
| `squid-quote` | Getting alternate route… | After Yes; Squid `getRoute` in progress |
| `execute` / `lifi-submit` / `squid-submit` | Submitted / Swapping… | Post-approval (reuse existing Li-Fi live tracking pattern) |
| `complete` | Complete / Failed | Terminal |

---

## V1 supported corridors (Squid fallback)

Intersect Squid’s `/v2/chains` with Radiant allowlist:

| Radiant | Squid chain id | Notes |
| ------- | -------------- | ----- |
| Ethereum `evm_chain_id: 1` | `"1"` | |
| Arbitrum `42161` | `"42161"` | |
| Base `8453` | `"8453"` | |
| Sui | `"sui-mainnet"` | |
| Solana | `"solana-mainnet-beta"` | Phase 2 if integrator beta / CHAINFLIP flows required |

**Env contract (new)**

| Variable | Purpose |
| -------- | ------- |
| `SQUID_ENABLED` | `true` / `false` — master switch |
| `SQUID_INTEGRATOR_ID` | Required when enabled; `x-integrator-id` header |
| `SQUID_ENABLED_CHAIN_IDS` | Optional override (Squid string ids); default derived from `ENABLED_CHAINS` + `ENABLED_EVM_CHAIN_IDS` |
| `SQUID_DEFAULT_SLIPPAGE` | e.g. `0.01` (1%) — align with Li-Fi default |
| `SQUID_RATE_LIMIT_CAPACITY` | Outbound token bucket |
| `SQUID_RATE_LIMIT_REFILL_MS` | ↑ |
| `SQUID_QUOTE_CACHE_TTL_SECONDS` | Dedupe quotes (mirror Li-Fi ~5s) |

---

## Architecture

```text
Client (chat timeline, consent dialog, approval modals)
    │
    ├── POST /api/v1/chat/stream              agent + stream steps
    └── POST /api/v1/agent-transactions/...   approve + fallback accept (new action)
            │
            ▼
services/agent/
    ├── bridge/bridge-execute.ts              → cross-chain router (not raw Li-Fi)
    ├── swap/swap-lifi-execute.ts             → cross-chain router
    ├── chains/evm/lifi/query-handlers.ts     → cross-chain router for cross_chain_*
    ├── chains/evm/lifi/execute-actions.ts    → dispatch by provider_id
    └── transaction-approval.service.ts         → fallback offer + Squid enricher
            │
            ▼
services/defi/cross-chain/                    NEW orchestration layer
    ├── cross-chain.types.ts                  provider-agnostic route types
    ├── cross-chain-router.service.ts         Li-Fi primary; Squid on user accept
    ├── cross-chain-fallback.service.ts         offer / accept / reject state machine
    └── cross-chain-cache.ts                  route_id → { provider, payload }
            │
            ├── services/defi/lifi/           existing (unchanged primary)
            └── services/defi/squid/          NEW (@0xsquid/sdk)
            │
            ▼
inngest/functions/
    ├── lifi-track-cross-chain.ts             existing
    └── squid-track-cross-chain.ts            NEW (poll with quoteId)
```

---

## Implementation checklist

> **Rule:** Mark `[x]` only when the task is implemented **and** verified (unit test or manual test noted). Do not check boxes in advance.

---

### Phase 0 — Planning & dependencies

| Status | Task | Path / notes |
| ------ | ---- | ------------ |
| [ ] | Apply for Squid **integrator ID** (staging + production) | [Squid typeform](https://squidrouter.typeform.com/integrator-id) |
| [ ] | Confirm integrator enables required corridors (Sui, EVM, Solana if Phase 2) | Squid dashboard / support |
| [x] | Add `@0xsquid/sdk` dependency (pin version ≥ 2.12.0) | `backend/package.json` |
| [x] | Document env vars in `backend/.env.example` | `SQUID_*` block |
| [x] | Add Squid reference row to provider matrix | `docs/defi-providers-integration-TODO.md` |

---

### Phase 1 — Config & shared types

| Status | Task | Path |
| ------ | ---- | ---- |
| [x] | `getSquidConfig()` — integrator id, base URL, slippage, enabled flag | `backend/src/config/squid.ts` |
| [x] | `isSquidEnabled()` guard | `backend/src/config/squid.ts` |
| [x] | `getEnabledSquidChainIds()` — intersect Radiant allowlist | `backend/src/config/squid-chains.ts` |
| [x] | `isSquidCrossEcosystemPair(from, to)` — same rules as Li-Fi corridors | `backend/src/config/squid-chains.ts` |
| [x] | Extend `DeFiProviderId` with `"evm-squid"` | `backend/src/services/defi/types.ts` |
| [x] | Register `evm-squid` in `swap-registry.ts` `PROVIDERS` map (metadata only; not default) | `backend/src/services/defi/swap-registry.ts` |
| [x] | Provider-agnostic `CrossChainRouteOption` with `provider_id` + discriminated `provider_payload` | `backend/src/services/defi/cross-chain/cross-chain.types.ts` |
| [x] | `CrossChainRoutesResult` + `LiquidityFallbackOffer` types | `backend/src/services/defi/cross-chain/cross-chain.types.ts` |
| [x] | `CrossChainFallbackStatus`: `offered` \| `accepted` \| `rejected` \| `expired` | ↑ |
| [x] | Unit tests: squid-chains allowlist intersection | `backend/tests/unit/config/squid-chains.test.ts` |

---

### Phase 2 — Squid SDK module (`services/defi/squid/`)

Mirror `lifi/` layout.

#### 2.1 Client

| Status | Task | Path |
| ------ | ---- | ---- |
| [x] | `squid.client.ts` — lazy `Squid` instance (`baseUrl`, `integratorId`) | `backend/src/services/defi/squid/squid.client.ts` |
| [x] | `getSquidSdk()` singleton + test reset hook | ↑ |
| [ ] | Optional REST fallback for endpoints SDK lacks (document which) | `squid-rest.ts` or inline in client |
| [x] | Timeout + 429 backoff (max 3) before `SQUID_UNAVAILABLE` | `squid.client.ts` |
| [x] | Unit tests with mocked SDK | `backend/tests/unit/defi/squid/squid.client.test.ts` |

#### 2.2 Chain & token mapping

| Status | Task | Path |
| ------ | ---- | ---- |
| [x] | `radiantToSquidChainId(ref)` / `squidToRadiantChainRef(id)` | `backend/src/services/defi/squid/squid-chain-map.ts` |
| [x] | `toSquidTokenAddress(symbol, chainRef)` — use `supported-tokens.ts` | `squid-input.ts` |
| [x] | `resolveSquidTokens(input)` — validation + same-token confirm flag | `squid-input.ts` |
| [x] | `resolveSquidWalletAddresses(privyUserId, from, to)` | `squid-wallet-addresses.ts` |
| [x] | Unit tests: chain map round-trip (Sui, Solana, EVM) | `squid-chain-map.test.ts` |

#### 2.3 Errors

| Status | Task | Path |
| ------ | ---- | ---- |
| [x] | `mapSquidError(err)` → `AppError` | `squid.errors.ts` |
| [x] | `SQUID_NO_ROUTE` (404 / no route / empty estimate) | ↑ |
| [x] | `SQUID_VALIDATION_ERROR` (400) | ↑ |
| [x] | `SQUID_RATE_LIMITED` (429) | ↑ |
| [x] | `SQUID_UNAVAILABLE` (5xx / timeout) | ↑ |
| [x] | Extend `guidanceForErrorCode` for Squid codes | `backend/src/utils/agent-tool-errors.ts` |
| [x] | Unit tests | `squid.errors.test.ts` |

#### 2.4 Rate limit & cache

| Status | Task | Path |
| ------ | ---- | ---- |
| [x] | `consumeSquidQuoteQuota(privyUserId)` — global + per-user bucket | `squid-rate-limit.ts` |
| [x] | `storeSquidRoute(routeId, payload)` for execute-time lookup | `squid-cache.ts` |
| [ ] | Quote dedupe via `defiCachedFetch` | `squid-routes.service.ts` — **skipped** (light cache policy) |
| [x] | `SQUID_QUOTE_TTL_MS` (~60s, align approval countdown) | `squid-normalize.ts` |

#### 2.5 Read services

| Status | Task | Path |
| ------ | ---- | ---- |
| [x] | `getSquidChains()` — cache 5 min, filter to enabled ids | `squid-chains.service.ts` |
| [x] | `getSquidTokens()` — cache per chain set | `squid-token-catalog.service.ts` |
| [ ] | `getSquidConnections(from, to)` — optional; for agent `cross_chain_connections` enrichment later | `squid-connections.service.ts` |

#### 2.6 Quote / routes

| Status | Task | Path |
| ------ | ---- | ---- |
| [x] | Zod input schemas: `squidQuoteInputSchema`, `squidRoutesInputSchema` | `squid.types.ts` |
| [x] | `getSquidRoute(privyUserId, input)` — SDK `getRoute` → single best route | `squid-quote.service.ts` |
| [x] | `getSquidRoutes(privyUserId, input)` — if API returns multiple; else wrap single | `squid-routes.service.ts` |
| [x] | `normalizeSquidRouteOption()` → `CrossChainRouteOption` with `provider_id: "evm-squid"` | `squid-normalize.ts` |
| [x] | Persist `quote_id`, `request_id`, full `squid_route` in cache | `squid-cache.ts` |
| [x] | `route_id` prefix: `squid:` + stable hash | `squid-normalize.ts` |
| [x] | Unit tests: normalize sample route fixture | `squid-normalize.test.ts` |
| [x] | Unit tests: quote service mocked SDK | `squid-quote.service.test.ts` |

#### 2.7 Execute

| Status | Task | Path |
| ------ | ---- | ---- |
| [x] | `resolveSquidRouteForExecute({ routeId, privyUserId, snapshotParams })` | `squid-quote.service.ts` |
| [x] | `executeSquidCrossChainSwap(privyUserId, input)` | `squid-execute.service.ts` |
| [x] | Map Squid `transactionRequest` → Privy EVM sign (viem) | ↑ |
| [x] | Sui source tx via Mysten signer adapter (if corridor needs it) | `squid-execute-providers.service.ts` |
| [x] | Solana source tx adapter — **Phase 2** if required | defer or `squid-execute-providers.service.ts` |
| [x] | Handle ERC-20 approval before swap if `transactionRequest` needs it | `squid-approval.service.ts` |
| [ ] | `squid_approve` execute action OR fold into unified `cross_chain_swap` preflight | `chains/evm/squid/execute-actions.ts` or extend lifi execute |
| [x] | Re-quote on expired route before execute (mirror Li-Fi) | `squid-quote.service.ts` |
| [x] | Unit tests: execute input validation | `squid-execute.service.test.ts` |

#### 2.8 Status & tracking

| Status | Task | Path |
| ------ | ---- | ---- |
| [x] | `getSquidCrossChainStatus(input)` — SDK/API `getStatus` with **`quoteId`** | `squid-status.service.ts` |
| [x] | Map statuses: `success`, `partial_success`, `needs_gas`, `not_found`, etc. | `squid-normalize.ts` |
| [x] | `SquidTrackingMeta` type (tx hash, quoteId, from/to chain ids) | `squid-tracking.types.ts` |
| [x] | `enqueueSquidTracking(job)` | `infrastructure/inngest/enqueue-squid-tracking.ts` |
| [x] | Inngest `squid-track-cross-chain` + poll loop | `inngest/functions/squid-track-*.ts` |
| [x] | Register functions in Inngest serve handler | `inngest/index.ts` |
| [x] | Unit tests: status mapping | `squid-status.test.ts` |

---

### Phase 3 — Cross-chain orchestration (Li-Fi primary + fallback offer)

| Status | Task | Path |
| ------ | ---- | ---- |
| [x] | `getCrossChainRoutes(privyUserId, input)` — Li-Fi only; **no** auto Squid | `cross-chain-router.service.ts` |
| [x] | Detect no-route: empty `routes`, `LIFI_NO_ROUTE`, re-quote failure at enrich time | `cross-chain-fallback.ts` |
| [x] | `isLiquidityFallbackEligible(err, routes)` — true only for no-liquidity cases | ↑ |
| [x] | `buildLiquidityFallbackOffer(input, lifiError?)` — snapshot params for later Squid quote | `cross-chain-fallback.service.ts` |
| [x] | `fallback_offer_id` stored in Redis with TTL (~10 min) + original quote params | `cross-chain-fallback-cache.ts` |
| [x] | `acceptLiquidityFallback(privyUserId, offerId)` → `getSquidRoutes` → routes result | ↑ |
| [x] | `rejectLiquidityFallback(offerId)` — mark rejected | ↑ |
| [x] | `resolveCrossChainRouteForExecute({ routeId })` — dispatch `lifi:` vs `squid:` prefix | `cross-chain-router.service.ts` |
| [x] | Unit tests: Li-Fi empty → offer; accept → Squid mocked; reject → no Squid call | `cross-chain-router.test.ts` |

---

### Phase 4 — Agent tool wiring (no new query types)

| Status | Task | Path |
| ------ | ---- | ---- |
| [x] | `cross_chain_routes` handler calls `getCrossChainRoutes` instead of `getLifiAdvancedRoutes` | `chains/evm/lifi/query-handlers.ts` |
| [x] | `cross_chain_quote` handler uses router best route | ↑ |
| [x] | Return shape includes `liquidity_fallback_offer` when Li-Fi has no routes (instead of bare error) | ↑ |
| [x] | `cross_chain_status` dispatches by `provider_id` on stored transaction metadata | ↑ |
| [x] | Solana plugin query handlers — same router delegation | `chains/registry.ts` (solana plugin) |
| [x] | Unit tests: query handler returns fallback offer on empty Li-Fi | `query-chain-squid-fallback.test.ts` |

---

### Phase 5 — Execute transaction & approval

| Status | Task | Path |
| ------ | ---- | ---- |
| [x] | `cross_chain_swap` execute: `resolveCrossChainRouteForExecute` → `executeLifi*` or `executeSquid*` | `execute-transaction-with-approval.ts` / `evm/lifi/execute-actions.ts` |
| [x] | Approval preview enricher dispatcher `enrichCrossChainExecuteInputForApproval` | `approval-preview/enrichers/cross-chain.ts` |
| [x] | `enrichSquidExecuteInputForApproval` — display pay/receive, fees, countdown | `approval-preview/enrichers/squid.ts` |
| [x] | `applySquidRouteToExecuteParams` (mirror `lifi-route-params.ts`) | ↑ |
| [x] | Approval dialog shows **provider-agnostic** labels; optional subtle “Alternate route” badge | `build-preview.ts`, `build-display.ts` |
| [x] | On Li-Fi enrich failure with `LIFI_NO_ROUTE` → return fallback offer on pending transaction, not 400 | `approval-preview/enrichers/lifi.ts` |
| [x] | `transaction-approval.service.ts` — new outcome: `liquidity_fallback_offered` | `transaction-approval.service.ts` |
| [x] | API: accept fallback on agent transaction or dedicated endpoint | `api/v1/agent-transactions/...` |
| [x] | Valuation / notional preview for Squid routes | `market/valuation.service.ts` |
| [x] | Unit tests: approval enricher Squid path | `approval-preview-squid.test.ts` |

---

### Phase 6 — Intent fast paths (bridge & same-chain Li-Fi swap)

| Status | Task | Path |
| ------ | ---- | ---- |
| [x] | `bridge-execute.ts` — use `getCrossChainRoutes`; on empty → `buildLiquidityFallbackOffer` in outcome | `bridge/bridge-execute.ts` |
| [x] | `swap-lifi-execute.ts` — same pattern | `swap/swap-lifi-execute.ts` |
| [x] | Stream/agent reply: offer consent instead of “No bridge routes available…” | ↑ |
| [x] | Integration test: bridge intent → Li-Fi empty → fallback offer payload | `bridge-execute-squid-fallback.test.ts` |

---

### Phase 7 — Agent stream & backend events

| Status | Task | Path |
| ------ | ---- | ---- |
| [ ] | New stream step type: `liquidity_fallback_offered` | `agent-stream.types.ts` |
| [ ] | Emit step when fallback built (quote-time or execute-time) | `agent-stream-lifi.ts` → `agent-stream-cross-chain.ts` |
| [ ] | Emit `squid_quote` step when user accepts and Squid quote starts | ↑ |
| [ ] | `inferStatusCategoryFromStep` — map new steps to `defi` category | client `useChatSession.ts` / stream parser |
| [ ] | Agent prompt: on fallback offer, wait for user — do not call `cross_chain_swap` until accepted | `prompts/protocols/lifi/bridge.ts` |
| [ ] | Optional prompt module `protocol:cross-chain:fallback` | `prompts/protocols/cross-chain/fallback.ts` |
| [ ] | Register in `module-triggers.ts` | ↑ |

---

### Phase 8 — Client UX

#### 8.1 Types & API

| Status | Task | Path |
| ------ | ---- | ---- |
| [ ] | `LiquidityFallbackOffer` client type | `client/src/lib/cross-chain-fallback.ts` |
| [ ] | `acceptLiquidityFallback(offerId)` API helper | ↑ |
| [ ] | `rejectLiquidityFallback(offerId)` API helper | ↑ |

#### 8.2 Consent dialog

| Status | Task | Path |
| ------ | ---- | ---- |
| [ ] | `LiquidityFallbackDialog` component — short Li-Fi message, Yes / No | `client/src/components/app/LiquidityFallbackDialog.tsx` |
| [ ] | Wire dialog to `pending_transaction.liquidity_fallback_offer` or stream payload | `ChatView.tsx` or approval layer |
| [ ] | On Yes: call accept API → open **second** approval modal with Squid route | ↑ |
| [ ] | On No: dismiss + update timeline step to cancelled/skipped | ↑ |
| [ ] | Prevent double-submit while Squid quote loading | ↑ |

#### 8.3 Execution timeline

| Status | Task | Path |
| ------ | ---- | ---- |
| [ ] | Map stream step `liquidity_fallback_offered` → ExecutionStep `fallback-offer` / “Finding another route…” | `client/src/lib/chat-execution-steps.ts` |
| [ ] | Map `squid_quote` step → “Getting alternate route…” | ↑ |
| [ ] | Generalize `lifi-execution-tracking.ts` → `cross-chain-execution-tracking.ts` OR branch on `provider_id` | `client/src/lib/` |
| [ ] | Squid submit/bridge/complete step labels (mirror Li-Fi) | ↑ |
| [ ] | `applySquidLiveUpdateToMessages` for post-approve streaming | ↑ |
| [ ] | Optimistic approval steps for Squid approve click | ↑ |
| [ ] | `LifiCountdownLabel` → generic `RouteCountdownLabel` or Squid branch | `client/src/components/app/` |

#### 8.4 Error sanitization

| Status | Task | Path |
| ------ | ---- | ---- |
| [ ] | Strip Squid SDK noise in client tool error display | `client/src/lib/sanitize-tool-error.ts` |
| [ ] | User-facing copy for `SQUID_NO_ROUTE` after user already consented | ↑ |

---

### Phase 9 — Solana / CHAINFLIP deposit flows (Phase 2 — optional v1.1)

| Status | Task | Path |
| ------ | ---- | ---- |
| [ ] | Document Squid `CHAINFLIP_DEPOSIT_ADDRESS` `transactionRequest.type` handling | `docs/squid-protocol-integration-TODO.md` |
| [ ] | Deposit-address API step before transfer | `squid-deposit.service.ts` |
| [ ] | Status polling with `bridgeType: chainflip` / `chainflipmultihop` | `squid-status.service.ts` |
| [ ] | Confirm integrator beta access for Solana↔EVM | external |
| [ ] | Client timeline steps for deposit-address flow | client |

---

### Phase 10 — Tests (summary gate)

| Status | Task | Path |
| ------ | ---- | ---- |
| [x] | Config: `squid-chains.test.ts` | `backend/tests/unit/config/` |
| [x] | Squid module unit tests (client, errors, normalize, quote) | `backend/tests/unit/defi/squid/` |
| [ ] | Cross-chain router + fallback state machine tests | `backend/tests/unit/defi/cross-chain/` |
| [ ] | Agent query handler fallback offer test | `backend/tests/unit/agent/` |
| [ ] | Approval preview Squid test | `backend/tests/unit/agent-transaction/` |
| [ ] | Bridge execute fallback test | `backend/tests/unit/agent/` |
| [ ] | Client unit tests: execution steps mapping for fallback | `client/tests/unit/` |
| [ ] | Manual E2E script or checklist: Li-Fi fail → consent → Squid approve → complete | `docs/squid-protocol-integration-TODO.md` § E2E |

---

### Phase 11 — Documentation & ops

| Status | Task | Path |
| ------ | ---- | ---- |
| [ ] | Link this doc from `defi-providers-integration-TODO.md` | docs |
| [ ] | `backend/AGENTS.md` — mention Squid fallback pattern | backend |
| [ ] | `client/AGENTS.md` — consent dialog + timeline | client |
| [ ] | Runbook: enable/disable `SQUID_ENABLED` in prod | docs |
| [ ] | Metrics/logging: `cross_chain_fallback_offered_total`, `cross_chain_fallback_accepted_total`, `squid_quote_success_total` | logger spans |

---

## E2E manual test checklist

| Status | Step |
| ------ | ---- |
| [ ] | Enable `SQUID_ENABLED=true` + valid `SQUID_INTEGRATOR_ID` locally |
| [ ] | Bridge USDC Ethereum → Base with amount/token Li-Fi cannot route (or mock Li-Fi empty) |
| [ ] | Verify timeline shows “Finding another route…” — **not** immediate error |
| [ ] | Consent dialog appears with Li-Fi message; **No** dismisses without Squid network call |
| [ ] | **Yes** triggers Squid quote; second approval shows pay/receive amounts |
| [ ] | Approve → stream shows Submitted → Swapping → Complete |
| [ ] | Transaction appears in history with correct provider metadata |
| [ ] | Status polling uses `quoteId` (verify in logs) |
| [ ] | Same flow from agent chat (not only intent fast path) |
| [ ] | Same-chain Li-Fi swap path triggers same fallback when no routes |

---

## Explicitly out of scope (v1)

- Silent automatic Squid fallback without user consent
- New top-level agent tools (`squid_quote`, etc.)
- Squid Widget embed in Radiant UI
- Stellar ↔ EVM via Squid (Stellar stays Soroswap-only)
- Replacing Li-Fi as primary router
- Regex intent parsers for Squid
- Server-side private keys / non-Privy signing

---

## Suggested implementation order

1. Phase 0 → 1 (config + types)
2. Phase 2.1–2.6 (Squid quote path only)
3. Phase 3 (fallback offer state machine)
4. Phase 8.1–8.2 (client consent dialog — can test offer before execute)
5. Phase 2.7–2.8 (execute + tracking)
6. Phase 4–6 (wire agent + intents + approval)
7. Phase 7–8.3 (stream + timeline polish)
8. Phase 9–11 (Solana deposit flows, tests, docs)

---

## File tree (new files)

```text
backend/src/config/squid.ts
backend/src/config/squid-chains.ts
backend/src/services/defi/cross-chain/
  cross-chain.types.ts
  cross-chain-router.service.ts
  cross-chain-fallback.service.ts
  cross-chain-fallback-cache.ts
backend/src/services/defi/squid/
  squid.client.ts
  squid.types.ts
  squid-chain-map.ts
  squid-input.ts
  squid-wallet-addresses.ts
  squid.errors.ts
  squid-rate-limit.ts
  squid-cache.ts
  squid-normalize.ts
  squid-chains.service.ts
  squid-token-catalog.service.ts
  squid-quote.service.ts
  squid-routes.service.ts
  squid-execute.service.ts
  squid-execute-providers.service.ts
  squid-approval.service.ts
  squid-status.service.ts
  squid-tracking.types.ts
  squid-tracking.ts
backend/src/inngest/functions/squid-track-cross-chain.ts
backend/src/inngest/functions/squid-track-poll.ts
backend/src/infrastructure/inngest/enqueue-squid-tracking.ts
backend/src/services/agent/chains/evm/squid/   (optional split from lifi execute)
backend/src/services/agent-transaction/approval-preview/enrichers/squid.ts
backend/src/services/agent-transaction/approval-preview/enrichers/cross-chain.ts
client/src/lib/cross-chain-fallback.ts
client/src/lib/cross-chain-execution-tracking.ts
client/src/components/app/LiquidityFallbackDialog.tsx
```
