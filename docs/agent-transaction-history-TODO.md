# Agent transaction history — implementation TODO

Durable ledger of every on-chain action the user's **agent wallet** initiates via Radiant chat — with bidirectional links to chat sessions/messages, explorer URLs, and a wallet activity feed.

**Related docs**

- [deepbook-v3-TODO.md](./deepbook-v3-TODO.md) — DeepBook `execute_transaction` actions and `TxResult` shape
- [backend/docs/TODO.md](../backend/docs/TODO.md) — Privy auth, agent wallets, chat persistence
- [backend/api-ref.md](../backend/api-ref.md) — versioned REST surface

**MVP principle:** Chat `tool_calls` remain the narrative replay layer. **`AgentTransaction` in Postgres** is the queryable source of truth for history, filters, and wallet UI — not JSON mining across `ChatMessage`.

**Legend:** `[Backend]` · `[Client]` · `[Both]`

---

## Product behavior

| Scenario | Expected behavior |
| -------- | ----------------- |
| User swaps via chat | Row created at approval or execute; digest + receipt linked to session/message |
| User approves pending tx | Row moves `pending_approval` → `success` / `failure`; chat receipt shows explorer link |
| User cancels approval bar | Row → `rejected`; still visible in history as declined |
| Pending approval expires (TTL) | Row → `expired` |
| User opens agent wallet panel | "Recent activity" lists last N txs across all chats |
| User taps activity row | Detail: summary, params snapshot, digest, explorer, **Open chat** |
| User in chat sees receipt | Optional "View in activity" deep link to transaction detail |
| Multi-step workflow (deposit → order) | One row per on-chain step; optional `workflow_step_index` |

### Explicitly out of scope (v1)

- Full block explorer inside Radiant (gas breakdown, event logs, internal PTB steps)
- Cross-user / marketplace agent tx feeds (explorer mock data stays separate)
- Reconciling history from chain backfill for txs that happened **before** this feature ships
- EVM / Solana agent tx history until those adapters execute real agent txs (schema is chain-agnostic; writers can no-op or stub)

---

## Architecture

```text
Client (chat receipts, wallet activity panel, optional activity page)
    │
    ├── POST /api/v1/chat                         (existing — triggers execute_transaction)
    ├── GET  /api/v1/agent/transactions           (list, paginated)
    ├── GET  /api/v1/agent/transactions/:id       (detail)
    └── GET  /api/v1/chat/sessions/:id/transactions  (optional — session-scoped list)
            │
            ▼
services/agent/
    ├── tools.ts                                  hook: after approval check / execute
    ├── transaction-approval.service.ts           hook: create pending, approve, reject, expire
    └── chat-orchestrator.ts                      pass session_id + message_id into writer
            │
            ▼
services/agent-transaction/                       NEW
    ├── agent-transaction.types.ts                status, category, list/detail DTOs
    ├── agent-transaction.service.ts              create, update, list, getById
    ├── agent-transaction.repository.ts           Prisma CRUD
    ├── categorize-action.ts                      action → category
    └── build-display.ts                          title, amount_display from PendingTransaction / TxResult
            │
            ▼
prisma/schema.prisma
    └── AgentTransaction                          user-scoped ledger
```

**Write path (single entry point):** all rows go through `recordAgentTransaction*` helpers — never ad-hoc Prisma inserts from routes.

---

## Data model

### `AgentTransaction` (Postgres)

| Column | Type | Notes |
| ------ | ---- | ----- |
| `id` | `UUID` PK | Same id can replace ephemeral `pending_transaction.id` when moving pending to DB |
| `user_id` | `BigInt` FK → `User` | Owner |
| `session_id` | `UUID?` FK → `ChatSession` | Chat that triggered the intent |
| `message_id` | `UUID?` FK → `ChatMessage` | Assistant message that surfaced approval/receipt |
| `workflow_step_index` | `Int?` | Step index when part of a workflow run |
| `chain_id` | `String` | `sui` \| `ethereum` \| `solana` |
| `wallet_address` | `String` | Agent wallet at time of intent |
| `action` | `String` | `execute_transaction` action, e.g. `swap`, `deepbook_place_limit_order` |
| `params` | `Json` | Exact tool params (audit) |
| `category` | `Enum` | UI filter bucket (see below) |
| `title` | `String` | Human headline, e.g. "Swap on DeepBook (SUI_USDC)" |
| `amount_display` | `String` | Human size line, e.g. "10 SUI → ~24.5 USDC" |
| `status` | `Enum` | Lifecycle (see below) |
| `digest` | `String?` | On-chain tx id (Sui digest, EVM tx hash, …) |
| `effects_status` | `String?` | `success` \| `failure` \| `unknown` from `TxResult` |
| `result` | `Json?` | Trimmed `TxResult` (especially `deepbook`) |
| `error_code` | `String?` | App error code on failure before chain |
| `error_message` | `String?` | Safe user-facing error summary |
| `created_at` | `DateTime` | Intent recorded |
| `submitted_at` | `DateTime?` | Broadcast time |
| `completed_at` | `DateTime?` | Final success/failure/reject/expired |

### Enums

**`AgentTransactionStatus`**

| Value | Meaning |
| ----- | ------- |
| `pending_approval` | Waiting on `TransactionApprovalBar` |
| `rejected` | User clicked Cancel |
| `expired` | Pending TTL elapsed without action |
| `submitted` | Signed and broadcast; awaiting confirmation (optional intermediate) |
| `success` | On-chain success |
| `failure` | Build/sign/broadcast/chain failure |

**`AgentTransactionCategory`**

| Value | `action` examples |
| ----- | ----------------- |
| `swap` | `swap`, `deepbook_swap` |
| `transfer` | `transfer_native`, `transfer_sui`, `transfer`, `transfer_eth`, `transfer_sol` |
| `deepbook_balance` | `deepbook_deposit`, `deepbook_withdraw`, `deepbook_provision_manager` |
| `deepbook_order` | `deepbook_place_limit_order`, `deepbook_place_market_order` |
| `deepbook_cancel` | `deepbook_cancel_order`, `deepbook_cancel_orders`, `deepbook_cancel_all_orders` |
| `deepbook_modify` | `deepbook_modify_order` |
| `deepbook_settled` | `deepbook_withdraw_settled_amounts`, `deepbook_withdraw_settled_amounts_permissionless` |
| `other` | `execute_bytes`, future actions |

### Indexes

| Index | Purpose |
| ----- | ------- |
| `(user_id, created_at DESC)` | Wallet activity feed |
| `(user_id, status, created_at DESC)` | Filter pending / failed |
| `(user_id, category, created_at DESC)` | Filter swaps / orders |
| `(session_id, created_at ASC)` | Session-scoped history |
| `(digest)` unique where not null | Dedupe / lookup by chain id |

---

## Status lifecycle

```text
                    ┌─────────────────┐
                    │ pending_approval │
                    └────────┬────────┘
           reject            │              expire
              ┌──────────────┼──────────────┐
              ▼              │ approve       ▼
        ┌──────────┐         │         ┌──────────┐
        │ rejected │         │         │ expired  │
        └──────────┘         ▼         └──────────┘
                    ┌─────────────────┐
                    │   submitted     │  (optional — can skip to terminal)
                    └────────┬────────┘
                             │
                    ┌────────┴────────┐
                    ▼                 ▼
              ┌──────────┐     ┌──────────┐
              │ success  │     │ failure  │
              └──────────┘     └──────────┘

Auto-approved execute (no bar): insert directly as success | failure
```

---

## Phase A — Schema & domain layer

> Blocks everything else.

### A.1 Prisma migration

| Status | Task | Owner |
| ------ | ---- | ----- |
| [x] | Add `AgentTransactionStatus` and `AgentTransactionCategory` enums to `schema.prisma` | [Backend] |
| [x] | Add `AgentTransaction` model with columns above | [Backend] |
| [x] | Add relations: `User.agent_transactions`, `ChatSession.agent_transactions`, optional `ChatMessage` FK | [Backend] |
| [x] | Run `npx prisma migrate dev --name add_agent_transaction` | [Backend] |
| [x] | Regenerate Prisma client | [Backend] |

### A.2 Service module (`services/agent-transaction/`)

| Status | Task | Owner |
| ------ | ---- | ----- |
| [ ] | `agent-transaction.types.ts` — `AgentTransactionListItem`, `AgentTransactionDetail`, create/update input types | [Backend] |
| [ ] | `categorize-action.ts` — map `action` string → `AgentTransactionCategory` | [Backend] |
| [ ] | `build-display.ts` — reuse logic from `createPendingTransaction` for `title` + `amount_display`; add post-execute enrichment from `TxResult` | [Backend] |
| [ ] | `agent-transaction.repository.ts` — `create`, `updateById`, `findByIdForUser`, `listForUser` (paginated), `findBySessionForUser` | [Backend] |
| [ ] | `agent-transaction.service.ts` — public API: | [Backend] |
| [ ] | → `recordPendingApproval({ userId, sessionId?, messageId?, input, pending, workflowStepIndex? })` | [Backend] |
| [ ] | → `recordAutoExecuted({ ... })` — no approval path | [Backend] |
| [ ] | → `markApprovedSubmitted(id)` | [Backend] |
| [ ] | → `markCompleted(id, { result \| error })` | [Backend] |
| [ ] | → `markRejected(id)` | [Backend] |
| [ ] | → `markExpired(id)` | [Backend] |
| [ ] | → `listTransactions(privyUserId, query)` / `getTransaction(privyUserId, id)` | [Backend] |
| [ ] | Resolve `wallet_address` from `AgentWallet` for `chain_id` at write time | [Backend] |

### A.3 Unit tests (domain)

| Status | Task | Owner |
| ------ | ---- | ----- |
| [ ] | `categorize-action` covers all current DeepBook + transfer + swap actions | [Backend] |
| [ ] | `build-display` snapshots for swap, limit order, deposit, cancel, modify | [Backend] |
| [ ] | Repository list pagination + user isolation (cannot read another user's row) | [Backend] |

---

## Phase B — Write hooks (record txs at source)

> Wire the ledger where txs already happen.

### B.1 Approval flow (`transaction-approval.service.ts`)

| Status | Task | Owner |
| ------ | ---- | ----- |
| [ ] | Extend `createPendingTransaction` to accept optional `{ sessionId, messageId, workflowStepIndex }` | [Backend] |
| [ ] | After building `PendingTransaction`, call `recordPendingApproval` — **use same UUID** as `pending.id` for correlation | [Backend] |
| [ ] | On `approvePendingTransaction` success: `markApprovedSubmitted` → `markCompleted` with `TxResult` | [Backend] |
| [ ] | On `approvePendingTransaction` failure: `markCompleted` with `error_code` / `error_message` | [Backend] |
| [ ] | Add `rejectPendingTransaction(privyUserId, transactionId)` — called when user cancels approval bar | [Backend] |
| [ ] | On reject: `markRejected` + remove from pending store | [Backend] |
| [ ] | On `pruneExpired`: `markExpired` for each pruned pending that has a DB row | [Backend] |

### B.2 Execute tool (`tools.ts`)

| Status | Task | Owner |
| ------ | ---- | ----- |
| [ ] | Thread `sessionId` / `messageId` / `workflowStepIndex` into `runExecuteTransactionToolWithApproval` | [Backend] |
| [ ] | When `needsApproval === false` and execute succeeds: `recordAutoExecuted` → `markCompleted(success)` | [Backend] |
| [ ] | When auto-execute throws before chain: `recordAutoExecuted` → `markCompleted(failure)` | [Backend] |

### B.3 Chat orchestration

| Status | Task | Owner |
| ------ | ---- | ----- |
| [ ] | `chat-orchestrator.ts` / `chat.service.ts` — pass `session_id` from request into tool dispatch | [Backend] |
| [ ] | After assistant message persisted, backfill `message_id` on transaction row(s) created that turn | [Backend] |
| [ ] | `workflow-runner.ts` — pass `workflow_step_index` per execute step | [Backend] |
| [ ] | `single-swap-flow.ts` — record auto-executed or pending swap txs | [Backend] |

### B.4 Chat request: reject path

| Status | Task | Owner |
| ------ | ---- | ----- |
| [ ] | Add `reject_transaction_id` (or reuse cancel on approval bar API) to chat request schema if not already explicit | [Backend] |
| [ ] | `POST /api/v1/chat` handler: reject branch calls `rejectPendingTransaction` | [Backend] |
| [ ] | Client `TransactionApprovalBar` Cancel → send `reject_transaction_id` | [Client] |

### B.5 Migrate pending store (optional in B, required before prod)

| Status | Task | Owner |
| ------ | ---- | ----- |
| [ ] | **Phase B-lite:** keep in-memory pending map; DB row is parallel audit trail | [Backend] |
| [ ] | **Phase B-full:** pending map reads/writes `AgentTransaction` where `status = pending_approval` | [Backend] |
| [ ] | `approvePendingTransaction` loads input from DB row `params` + `action` + `chain_id` | [Backend] |
| [ ] | Survives server restart without losing pending approvals | [Backend] |

---

## Phase C — Read API

### C.1 Routes (`api/routes/v1/agent/transactions/`)

| Status | Task | Owner |
| ------ | ---- | ----- |
| [ ] | `GET /api/v1/agent/transactions` — list for authenticated user | [Backend] |
| [ ] | Query params: `page`, `limit` (default 20, max 100), `status`, `category`, `chain_id`, `session_id` | [Backend] |
| [ ] | Response envelope: `{ success, data: { items, meta: { pagination } } }` | [Backend] |
| [ ] | `GET /api/v1/agent/transactions/:id` — detail DTO with full `params`, `result`, explorer URL | [Backend] |
| [ ] | `GET /api/v1/chat/sessions/:sessionId/transactions` — optional convenience list | [Backend] |
| [ ] | Register routes in `api/routes/v1/mod.ts` | [Backend] |
| [ ] | Document in `backend/api-ref.md` | [Backend] |

### C.2 List item / detail DTOs

| Status | Task | Owner |
| ------ | ---- | ----- |
| [ ] | `AgentTransactionListItem` — id, status, category, chain_id, title, amount_display, digest, effects_status, session_id, message_id, created_at, completed_at | [Backend] |
| [ ] | `AgentTransactionDetail` — adds params, result, error_*, wallet_address, workflow_step_index, explorer_url | [Backend] |
| [ ] | `explorer_url` built via existing chain meta helpers (Sui explorer base + digest) | [Backend] |

### C.3 Integration tests

| Status | Task | Owner |
| ------ | ---- | ----- |
| [ ] | `GET /api/v1/agent/transactions` returns 401 without auth | [Backend] |
| [ ] | List returns only caller's rows | [Backend] |
| [ ] | Detail 404 for other user's id | [Backend] |

---

## Phase D — Chat ↔ transaction linking

### D.1 `tool_calls` enrichment

| Status | Task | Owner |
| ------ | ---- | ----- |
| [ ] | On `approval_required` outcome, include `agent_transaction_id` in tool result JSON | [Backend] |
| [ ] | On `executed` outcome, include `agent_transaction_id` | [Backend] |
| [ ] | Type update in `agent.types.ts` / client `chat-api.ts` | [Both] |

### D.2 Message backfill

| Status | Task | Owner |
| ------ | ---- | ----- |
| [ ] | After `createMessage` for assistant turn, update related `AgentTransaction.message_id` | [Backend] |
| [ ] | Handle multiple executes in one turn (workflow) — link all rows from that turn to same `message_id` | [Backend] |

### D.3 Client chat receipts

| Status | Task | Owner |
| ------ | ---- | ----- |
| [ ] | `chat-messages.ts` — read `agent_transaction_id` from tool results | [Client] |
| [ ] | Receipt row: explorer link when digest present | [Client] |
| [ ] | Receipt row: "View activity" link → `/app/activity/:id` or drawer | [Client] |

---

## Phase E — Client UI

### E.1 API client

| Status | Task | Owner |
| ------ | ---- | ----- |
| [ ] | `client/src/lib/agent-transactions-api.ts` — `listAgentTransactions`, `getAgentTransaction` | [Client] |
| [ ] | Types mirror backend list/detail DTOs | [Client] |

### E.2 Agent wallet — Recent activity

| Status | Task | Owner |
| ------ | ---- | ----- |
| [ ] | `AgentWalletSection` or new `AgentActivityPanel` — fetch last 5–10 txs | [Client] |
| [ ] | Row: status chip, title, amount_display, relative time | [Client] |
| [ ] | Row actions: explorer (if digest), "Open chat" (if session_id) | [Client] |
| [ ] | Empty state: "No agent transactions yet" | [Client] |
| [ ] | Loading + error states | [Client] |

### E.3 Activity detail (lightweight)

| Status | Task | Owner |
| ------ | ---- | ----- |
| [ ] | Modal or slide-over: full summary, status timeline, params snapshot (collapsed), result JSON (collapsed) | [Client] |
| [ ] | Primary CTA: Open chat → navigate to `session_id` with hash/message scroll | [Client] |
| [ ] | Secondary CTA: View on explorer | [Client] |

### E.4 Optional full activity page (v1.1)

| Status | Task | Owner |
| ------ | ---- | ----- |
| [ ] | `/app/activity` — paginated table with filters (category, status) | [Client] |
| [ ] | Sidebar nav entry | [Client] |

---

## Phase F — Agent prompts & receipts (polish)

| Status | Task | Owner |
| ------ | ---- | ----- |
| [ ] | System prompt: agent can mention "your activity" / recent txs when user asks what the agent did | [Backend] |
| [ ] | Optional `query_chain` → `agent_transactions` read for agent (list recent 10) — **defer** unless user asks agent to summarize history | [Backend] |
| [ ] | Failed tx rows: ensure `error_message` is safe for UI (no stack traces) | [Backend] |

---

## Phase G — Testing checklist

| Area | Tests |
| ---- | ----- |
| Unit | `categorize-action`, `build-display`, status transitions |
| Unit | Approval service creates DB row with same id as `pending.id` |
| Unit | Reject + expire update status |
| Integration | Chat approve flow persists success row with digest |
| Integration | Chat reject flow persists rejected row |
| Integration | Auto-approve swap creates success row without pending |
| Integration | API list pagination + auth isolation |
| Client | Activity panel renders mock list; explorer + chat links |

---

## API quick reference (target)

### `GET /api/v1/agent/transactions`

```http
GET /api/v1/agent/transactions?page=1&limit=20&category=swap&status=success
```

```json
{
  "success": true,
  "data": {
    "items": [
      {
        "id": "uuid",
        "status": "success",
        "category": "swap",
        "chain_id": "sui",
        "title": "Swap on DeepBook (SUI_USDC)",
        "amount_display": "10 SUI → ~24.5 USDC",
        "digest": "8xK…",
        "effects_status": "success",
        "session_id": "uuid",
        "message_id": "uuid",
        "created_at": "2026-06-13T00:00:00.000Z",
        "completed_at": "2026-06-13T00:00:05.000Z"
      }
    ]
  },
  "meta": {
    "pagination": { "page": 1, "limit": 20, "total": 42 },
    "correlation_id": "…",
    "timestamp": "…"
  },
  "error": null
}
```

### Chat `tool_calls` shape (addition)

```json
{
  "name": "execute_transaction",
  "result": {
    "status": "executed",
    "agent_transaction_id": "uuid",
    "result": { "chain_id": "sui", "digest": "…", "effects_status": "success" }
  }
}
```

---

## Suggested implementation order

```text
A Schema & domain
    → B Write hooks (B-lite: parallel DB + in-memory pending)
    → C Read API
    → D Chat linking
    → E Client wallet activity panel
    → B-full Pending migration to DB (before prod)
    → E.4 Full activity page (optional)
    → F Agent polish
```

**Rationale:** Schema + write hooks deliver data immediately; read API + wallet panel prove value; pending DB migration hardens prod; full activity page is UX polish.

---

## Cross-links to update when done

| Doc | Action |
| --- | ------ |
| `backend/api-ref.md` | Add agent transactions routes |
| `backend/docs/TODO.md` | Link to this doc; add phase checkbox |
| `docs/deepbook-v3-TODO.md` | Note transaction history covers DeepBook execute receipts |
| `README.md` | One line under agent wallet features |

---

## Open decisions (resolve during Phase A)

| # | Question | Recommendation |
| - | -------- | -------------- |
| 1 | Reuse `pending.id` as `AgentTransaction.id`? | **Yes** — simplest client correlation |
| 2 | Store full `params` or redact recipients? | **Full params** for v1 (user's own data); revisit for shared sessions |
| 3 | `submitted` status or jump to terminal? | **Skip `submitted`** for v1 unless async confirmation added |
| 4 | Backfill from existing `ChatMessage.tool_calls`? | **Optional script** — low priority; forward-only for launch |
| 5 | Reject via chat body vs dedicated endpoint? | **`reject_transaction_id` on POST /chat** — matches approve pattern |
