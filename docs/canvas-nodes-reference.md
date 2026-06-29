# Canvas workflow nodes — reference

What exists in Radiant Canvas today: palette nodes, runtime behavior (Dry-run vs Live), Builder agent support, and known frontend gaps (e.g. **Dry-run Gate** shows ports but no Configure fields).

**Source of truth:** `client/src/components/canvas/node-catalog.ts`, `backend/src/services/canvas/graph/node-slug-map.ts`, `backend/src/services/canvas/runtime/dry-run-node-registry.ts`, `backend/src/services/canvas/runtime/live-node-registry.ts`.

---

## Can the Builder agent create its own node types?

**No.** The Builder only adds nodes from a fixed catalog (`BUILDER_V1_NODE_SLUGS` — 38 slugs). Unknown slugs are rejected with `UNKNOWN_NODE_SLUG`.

The Builder **can**:

- Pick among alias slugs (e.g. `polymarket-feed` vs `polymarket-market`, `polymarket-place-market` vs `polymarket-order`)
- Set config via `patch_node` using documented keys

The Builder **cannot**:

- Invent a new node type or slug
- Add Limitless nodes (`limitless-market`, `limitless-order`, `limitless-positions`) — not in Builder v1

If you drag a palette slug that has no backend type yet, the board may persist it as `custom_app_action` + `_catalog_slug` on save — but that is a storage fallback, not a new executable type.

---

## How workflows get triggered

| Entry / driver | Slug | Starts a run? | Notes |
|----------------|------|---------------|-------|
| **Start** | `workflow-start` | **Yes** — manual Run / dry-run | Primary entry; emits `trigger` |
| **Schedule / Cron** | `schedule-cron` | **Yes** — when scheduler fires | Alternative entry; emits `trigger` |
| **Whale Tracker** | `whale-tx-tracker` | **Yes** — on-chain event (when wired) | Source node; emits `trigger` + `data` |
| **Polymarket Market** | `polymarket-market` | **No** — data source only | No trigger input; poll/stream feeds `data` / `market` |
| **UI Button** | `ui-button` | **Yes** — user click in monitor UI | Emits `trigger` from `data` input binding |
| **Threshold / Compare / IF** | logic nodes | **Downstream only** | Fire when upstream `data`/`trigger` arrives |
| **Delay** | `delay` | Downstream only | Passthrough stub; durable resume not fully wired |

Most trading flows: **Start** (or Schedule) → optional gates → **feed `data`** → logic → **Approve** → **Policy Gate** → **Order**.

**Important:** Do **not** wire `Start.trigger → Polymarket Market` — market feeds have **no trigger input**. Wire `feed.data → threshold / ui-table / ui-label` instead.

---

## Runtime legend

| Symbol | Meaning |
|--------|---------|
| **Dry: full** | Dedicated handler with real branch logic (may still simulate side effects) |
| **Dry: sim** | Simulated order/action (fake fill, no chain/PM call) |
| **Dry: pass** | Passthrough — forwards or echoes upstream data |
| **Dry: UI** | Binds to monitor panel (table, label, chart, button) |
| **Live: real** | Real Polymarket order or Li-Fi action (when env/policy allow) |
| **Live: policy** | Real policy enforcement (`policy_gate`) |
| **Live: wrap** | Reuses dry-run logic; no real external execution |
| **Live: stub** | Node runs but does not execute the advertised action |

Workflow modes: **Dry-run** (`dry_run_ready`) vs **Live** (`live`). Policy is enforced at workflow level; per-node `policy-gate` override fields are shown in UI but **Live still uses workflow policy** for caps.

---

## Palette nodes (32) — full list

All rows appear in the sidebar palette. **Builder** column = Builder agent can `add_node` this slug (or an alias).

| Title | Slug | Group | Can start run? | Dry-run | Live | Config UI | Builder | Notes |
|-------|------|-------|----------------|---------|------|-----------|---------|-------|
| Start | `workflow-start` | Workflow | Yes | Dry: full | Live: wrap | None (by design) | Yes | Entry node |
| Approve | `workflow-approve` | Workflow | No | Dry: full | Live: wrap | Yes | Yes | Auto-approves in dry-run |
| Stop | `workflow-stop` | Workflow | No | Dry: full | Live: wrap | Yes | Yes | Terminal; wire `action.data → stop.signal` |
| Schedule / Cron | `schedule-cron` | Workflow | Yes | Dry: pass | Live: stub | Yes | Yes | Scheduler not fully production |
| Notify | `notify` | Workflow | No | Dry: full | Live: wrap | Yes | Yes | Simulated delivery in dry-run |
| Delay | `delay` | Workflow | No | Dry: pass | Live: stub | Yes | Yes | Durable delay resume TBD |
| Price Chart | `price-chart` | Data | No | Dry: pass | Live: wrap | Yes | Yes | External chart feed |
| Whale Tracker | `whale-tx-tracker` | Data | Yes (source) | Dry: pass | Live: wrap | Yes | Yes | On-chain trigger source |
| Wallet Balance | `wallet-balance` | Data | No | Dry: pass | Live: wrap | Yes | Yes | Read wallet |
| Polymarket Market | `polymarket-market` | Data | No | Dry: pass | Live: wrap | Yes | Yes (`polymarket-feed`) | PM order book / mid |
| Polymarket Positions | `polymarket-positions` | Data | No | Dry: pass | Live: wrap | Yes | Yes | Positions snapshot |
| Limitless Market | `limitless-market` | Data | No | Dry: pass | Live: wrap | Yes | **No** | Feed only; no Builder slug |
| Route Status | `lifi-route-status` | Li-Fi | No | Dry: pass | Live: wrap | **None** | Yes | Tracking node |
| IF | `if-condition` | Logic | No | Dry: full | Live: wrap | Yes | Yes | Branch on expression |
| Compare | `compare` | Logic | No | Dry: full | Live: wrap | Yes | Yes | Two `data` inputs |
| Threshold | `threshold` | Logic | No | Dry: full | Live: wrap | Yes | Yes | Emits `trigger` when crossed |
| Policy Gate | `policy-gate` | Logic | No | Dry: full (warn) | **Live: policy** | Yes | Yes | Real enforcement in Live |
| Dry-run Gate | `dry-run-gate` | Logic | No | Dry: full | Live: wrap | **None** | Yes | **Empty Configure tab** — ports only; routes to simulator in dry-run |
| AI Reasoning | `ai-reason` | AI | No | Dry: pass | Live: stub | Yes | Yes | **No LLM executor yet** — passthrough only |
| Place Order | `place-order` | Actions | No | Dry: sim | **Live: real PM** | Yes | Yes | Generic PM order |
| Polymarket Order | `polymarket-order` | Actions | No | Dry: sim | **Live: real PM** | Yes | Yes | Same backend as place-order |
| Swap | `swap` | Actions | No | Dry: sim | Live: Li-Fi* | Yes | Yes | *Mock unless configured |
| Bridge | `bridge` | Actions | No | Dry: sim | Live: Li-Fi* | Yes | Yes | *Mock unless configured |
| Li-Fi Quote | `lifi-quote` | Actions | No | Dry: sim | Live: Li-Fi* | Yes | Yes | Quote → `order_intent` |
| Copy Trade | `copy-trade` | Actions | No | Dry: sim | Live: stub | Yes | Yes | Simulated; not live copy |
| Transfer | `transfer` | Actions | No | Dry: pass | Live: stub | **None** | Yes | **Empty Configure tab**; stored as `custom_app_action` |
| Limitless Order | `limitless-order` | Actions | No | Dry: pass | Live: stub | Yes (coming soon) | **No** | Badge: coming soon |
| Limitless Positions | `limitless-positions` | Data | No | Dry: pass | Live: stub | Yes | **No** | Stub persistence |
| UI Button | `ui-button` | UI | Yes (click) | Dry: UI | Live: wrap | Yes | Yes | User trigger in monitor |
| UI Table | `ui-table` | UI | No | Dry: UI | Live: wrap | Yes | Yes | Live book / multi-feed |
| UI Label | `ui-label` | UI | No | Dry: UI | Live: wrap | Yes | Yes | Price / mid display |
| UI Chart | `ui-chart` | UI | No | Dry: UI | Live: wrap | Yes | Yes | Sparkline / series |

---

## Builder-only slugs (not separate palette cards)

These map to palette equivalents but are what the Builder agent uses in tool calls.

| Builder slug | Backend type | Palette equivalent | Dry-run | Live |
|--------------|--------------|-------------------|---------|------|
| `polymarket-feed` | `polymarket_feed` | Polymarket Market | pass | wrap |
| `polymarket-orderbook` | `polymarket_orderbook` | Polymarket Market | pass | wrap |
| `polymarket-place-market` | `polymarket_place_market` | Polymarket Order | sim | **real PM** |
| `polymarket-place-limit` | `polymarket_place_limit` | Polymarket Order | sim | **real PM** |
| `polymarket-cancel-order` | `polymarket_cancel_order` | Polymarket Order (cancel) | sim | stub |
| `lifi-swap` | `lifi_swap` | Swap | sim | Li-Fi |
| `lifi-bridge` | `lifi_bridge` | Bridge | sim | Li-Fi |
| `lifi-liquidity-fallback` | `lifi_liquidity_fallback` | — | sim | stub |
| `ui-panel` | `ui_panel` | — | UI | wrap |

---

## Backend-only types (no palette card)

| Backend type | Slug (default) | In Builder? | Dry-run | Live |
|--------------|----------------|-------------|---------|------|
| `workflow_pause` | `workflow-pause` | No | pass | wrap |
| `workflow_resume` | `workflow-resume` | No | pass | wrap |
| `swap_bridge` | `swap-bridge` | No | sim | Li-Fi |
| `custom_app_action` | `custom-app-action` | Yes (`transfer`) | pass | stub |

---

## Port wiring cheat sheet

| From port | To port | Use for |
|-----------|---------|---------|
| `trigger` | `trigger` | Control flow (Start → Approve → Order) |
| `data` | `data` | Feeds → Threshold, UI Table, UI Label |
| `market` | `market` | PM feed → PM order |
| `signal` | `signal` or `trigger` | Threshold fired → AI Reason / Approve |
| `order_intent` | `order_intent` | Quote → Policy / Dry-run gate |
| `data` (order) | `signal` (stop) | **Order complete → Stop** (not `stop.trigger`) |

Never wire `signal → data` (incompatible).

---

## Frontend gaps (empty or misleading UI)

| Node | What you see | Why |
|------|--------------|-----|
| **Dry-run Gate** | Preview + ports; **Configure tab empty** | No `fields` in catalog — behavior is mode-based (simulator vs live pass-through) |
| **Transfer** | Configure tab empty | Stub action; no transfer executor |
| **Route Status** | No config fields | Read-only tracking node |
| **Start** | No config | Entry node by design |
| **AI Reasoning** | Full config UI | Prompt/max_tokens saved but **runtime is passthrough** — no LLM call yet |
| **Policy Gate** | Override fields visible | Live enforcement uses **workflow policy**; override caps not applied in Live |
| **Limitless Order** | Config + “Coming soon” | Not live trading |

Inspect any node: **Preview → Configure → Inputs → Outputs** in the node modal (`NodeDetailModal`).

---

## What actually executes in Live today

**Real side effects:**

- `polymarket-order` / `place-order` / `polymarket-place-market` / `polymarket-place-limit` → Polymarket CLOB
- `swap` / `bridge` / `lifi-quote` / `lifi-swap` / `lifi-bridge` → Li-Fi (mock when `CANVAS_RUNTIME_MOCK` or not configured)
- `policy-gate` → workflow policy check (blocks if over cap)

**Everything else in Live** either wraps dry-run logic or passthroughs data without external calls.

---

## Builder config keys (for agent patching)

Documented in `BUILDER_CONFIG_FIELDS`:

`workflow-approve`, `threshold`, `polymarket-feed`, `polymarket-market`, `polymarket-order`, `polymarket-place-market`, `polymarket-place-limit`, `place-order`, `policy-gate`, `ui-table`, `ui-label`, `ui-chart`, `price-chart`, `ai-reason`, `schedule-cron`, `notify`, `delay`, `copy-trade`, `swap`, `bridge`, `lifi-quote`

Other slugs: optional config or palette fields when edited manually.

---

## Counts

| Set | Count |
|-----|-------|
| Backend `CANVAS_NODE_TYPES` | 38 |
| Builder `BUILDER_V1_NODE_SLUGS` | 38 |
| Sidebar palette entries | 32 |
| Palette without Builder | 3 (Limitless ×3) |

---

## Related docs

- Architecture roadmap: `docs/canvas-workflows-architecture-TODO.md`
- Builder port rules: `backend/src/services/canvas/build/builder-port-catalog.ts`
- Inspector port docs: `client/src/components/canvas/node-port-docs.ts`
