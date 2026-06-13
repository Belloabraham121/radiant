# DeepBook V3 — implementation TODO

Composable onchain DeFi for Radiant on **Sui**, starting with **DeepBook V3** (`@mysten/deepbook-v3`). One doc for backend, client, agent tools, and indexer.

**References**

- [DeepBookV3 overview](https://docs.sui.io/onchain-finance/deepbookv3/deepbook)
- [DeepBookV3 SDK](https://docs.sui.io/onchain-finance/deepbookv3-sdk/)
- [DeepBookV3 Indexer](https://docs.sui.io/onchain-finance/deepbookv3/deepbookv3-indexer)
- [MystenLabs/deepbookv3](https://github.com/MystenLabs/deepbookv3) (contracts + self-hosted indexer)

**MVP principle:** Agent tools stay **chain-agnostic** (`query_chain`, `execute_transaction`). DeepBook specifics live in `services/defi/` and are invoked by the Sui adapter — not new top-level agent tools per venue.

**Network:** `mainnet` first; `testnet` for dev via env (`DEEPBOOK_ENV`, `DEEPBOOK_INDEXER_URL`).

---

## Product behavior

| Scenario | Expected behavior |
| -------- | ----------------- |
| User asks “swap 10 SUI to USDC” | Agent quotes via indexer/SDK → builds swap PTB → approval if over threshold → executes → receipt in chat |
| User asks “what’s the best SUI/USDC rate?” | `query_chain` → `swap_quote` (indexer orderbook + SDK pool params) |
| User asks “show my open orders” | `query_chain` → `deepbook_open_orders` (SDK read + optional indexer `/orders`) |
| User places limit order | `execute_transaction` → `deepbook_place_limit_order` → approval |
| User stakes DEEP in SUI pool | `execute_transaction` → `deepbook_stake` → approval |
| User votes on governance proposal | `execute_transaction` → `deepbook_vote` → approval |
| Flash loan (advanced) | `execute_transaction` → `deepbook_flash_loan` → **always** requires approval + explicit user intent |
| Settings: “Auto-approve under 25 SUI” | Persisted per-user; applies to transfers **and** swap notional (and later stake amounts) |
| User opens profile → “In your wallet” | Shows SUI, USDC, DEEP, … from agent wallet ([wallet-assets-TODO.md](./wallet-assets-TODO.md)) |

### Explicitly out of scope (v1)

- DeepBook **margin** trading (`deepbook-margin` indexer package — not on mainnet yet)
- EVM Uniswap / other DEX providers (future `services/defi/providers/evm-uniswap.provider.ts`)
- Full trading terminal UI (order ladder, depth chart) — agent + lightweight receipts first
- Running a **self-hosted** indexer in production (use public indexer v1; self-host is Phase I optional)

---

## Architecture

```text
Client (chat, settings, optional DeFi panels)
    │
    ├── POST /api/v1/chat                    (agent: query_chain, execute_transaction)
    ├── GET  /api/v1/defi/...                (optional REST for UI — quotes, pools, orderbook)
    └── PATCH /api/v1/users/me/permissions   (auto-approve thresholds, DeFi toggles)
            │
            ▼
services/agent/
    ├── query-chain.tool.ts                  extend query enum
    ├── execute-transaction.tool.ts
    └── transaction-approval.service.ts      extend beyond transfers
            │
            ▼
services/defi/                               NEW — composable DeFi layer
    ├── types.ts                               SwapQuote, PoolInfo, OrderInfo, …
    ├── swap-registry.ts                       route quote/build by provider id
    ├── indexer/
    │   ├── deepbook-indexer.client.ts         HTTP client → public indexer
    │   └── normalize.ts                       scalars, pool names, OHLCV
    └── providers/
        └── sui-deepbook.provider.ts           DeepBookClient wrapper
            │
            ▼
services/chains/adapters/sui.ts              execute + read via provider
            │
            ▼
infrastructure/sui/                          SuiClient, signing (existing Privy path)
```

**Key rule:** `DeepBookClient` is constructed **per agent wallet** with `address` + registered `balanceManagers` map. Persist each user’s balance manager object id in Postgres after first create.

**SDK modules → provider surface**

| SDK contract | Radiant responsibility |
| ------------ | ------------------------ |
| `BalanceManagerContract` | Create/share/register manager; deposit/withdraw; proofs; referrals |
| `DeepBookContract` | Pool reads; place/cancel/modify orders; swaps |
| `FlashLoanContract` | Borrow + repay in single PTB |
| `GovernanceContract` | Stake/unstake DEEP; submit/vote proposals |

---

## Data model (Postgres / Prisma)

### `DeepBookBalanceManager`

One row per user (MVP: single manager per agent wallet).

| Column | Type | Notes |
| ------ | ---- | ----- |
| `id` | UUID PK | |
| `user_id` | FK → `User` @unique | |
| `chain_id` | TEXT | `sui` |
| `manager_object_id` | TEXT | On-chain `BalanceManager` shared object id |
| `manager_key` | TEXT | SDK in-memory key, e.g. `RADIANT_BM_1` |
| `trade_cap_id` | TEXT nullable | If minted for traders |
| `created_at` | TIMESTAMPTZ | |
| `updated_at` | TIMESTAMPTZ | |

### `UserAgentPermissions` (or JSONB on `User`)

| Column | Type | Notes |
| ------ | ---- | ----- |
| `user_id` | FK @unique | |
| `auto_approve_max_sui` | DECIMAL nullable | Display units; null = always approve |
| `auto_approve_swaps` | BOOLEAN | Default false until user opts in |
| `allow_flash_loans` | BOOLEAN | Default false |
| `allow_governance` | BOOLEAN | Default true |
| `updated_at` | TIMESTAMPTZ | |

### Optional cache tables (Phase I — self-hosted indexer only)

`DeepBookTrade`, `DeepBookOrderUpdate` — only if running own indexer + ingesting into Radiant DB. **Not required** when using public HTTP indexer.

---

## Environment variables

| Variable | Example | Purpose |
| -------- | ------- | ------- |
| `DEEPBOOK_ENV` | `mainnet` \| `testnet` | SDK `env` / `network` |
| `DEEPBOOK_INDEXER_URL` | `https://deepbook-indexer.mainnet.mystenlabs.com` | Read-only market data |
| `DEEPBOOK_DEFAULT_POOL` | `SUI_USDC` | Agent default swap pair |
| `AGENT_AUTO_APPROVE_MAX_SUI` | `25` | Global fallback until per-user prefs wired |

---

## Phase A — Foundation (SDK + DeFi layer)

> Install SDK, scaffold `services/defi/`, wire config. No agent-facing swap yet.

### Backend

| Status | Task |
| ------ | ---- |
| [x] | Add `@mysten/deepbook-v3` to `backend/package.json` |
| [x] | `src/config/deepbook.ts` — env, default pools/coins, indexer base URL |
| [x] | `services/defi/types.ts` — `DeFiProviderId`, `SwapQuote`, `PoolSummary`, `OrderSummary`, `StakeSummary` |
| [x] | `services/defi/providers/sui-deepbook.provider.ts` — lazy `DeepBookClient` factory per `(address, balanceManagers)` |
| [x] | `services/defi/swap-registry.ts` — register `sui-deepbook`; stub for future providers |
| [x] | Unit tests: config parsing, provider init with mock SuiClient |

### Client

| Status | Task |
| ------ | ---- |
| [ ] | No UI required in Phase A |

---

## Phase B — Balance manager

> Every trade/order/stake path requires a shared `BalanceManager`. Auto-provision on first DeFi action.

### Backend

| Status | Task |
| ------ | ---- |
| [x] | Prisma `DeepBookBalanceManager` + migration |
| [x] | `services/defi/deepbook-balance-manager.service.ts` |
| [x] | `ensureBalanceManager(privyUserId)` — load from DB or create via SDK: `createAndShareBalanceManager` / `registerBalanceManager` |
| [x] | Persist `manager_object_id` + `manager_key` after first successful tx |
| [x] | Read: `checkManagerBalance(managerKey, coinKey)` — per-coin balances in manager |
| [x] | Write actions (via `execute_transaction`): `deepbook_deposit`, `deepbook_withdraw` |
| [x] | `generateProof` helper used by order placement PTBs |
| [x] | Extend `query_chain` queries: `deepbook_manager_balance`, `deepbook_manager_info` |
| [x] | Tests: ensure idempotent ensure (no duplicate managers) |

### Client

| Status | Task |
| ------ | ---- |
| [x] | Chat receipt template for deposit/withdraw (digest, coin, amount) |
| [x] | Optional: “DeepBook balances” line in agent wallet section (manager vs wallet) |

---

## Phase C — Pools (read) + indexer client

> Market data without writes. Indexer for time-series; SDK for on-chain pool params when needed.

### Backend

| Status | Task |
| ------ | ---- |
| [x] | `services/defi/indexer/deepbook-indexer.client.ts` — typed fetch wrapper |
| [x] | Implement reads: `GET /get_pools`, `/ticker`, `/summary`, `/assets` |
| [x] | `services/defi/indexer/normalize.ts` — apply asset scalars (SUI 9, USDC 6, DEEP 6, …) |
| [x] | Extend `query_chain`: `deepbook_pools`, `deepbook_pool_info`, `deepbook_ticker` |
| [x] | SDK read helpers: pool trade params (`taker_fee`, `maker_fee`, `stake_required`), book params (`tick_size`, `lot_size`, `min_size`) |
| [x] | `GET /api/v1/defi/pools` — optional REST mirror for UI |
| [x] | `GET /api/v1/defi/pools/:poolName/orderbook?level=&depth=` — proxy indexer `/orderbook` |
| [x] | Tests: normalize volume; handle indexer 404/timeout gracefully |

### Client

| Status | Task |
| ------ | ---- |
| [x] | `lib/deepbook-api.ts` — fetch pools, ticker, orderbook (if REST exposed) |
| [ ] | Explorer / marketing copy already mentions DeepBook — link live pool stats when available |

---

## Phase D — Swap

> Highest-priority write path. Agent “swap X to Y” routes through DeepBook.

### Backend

| Status | Task |
| ------ | ---- |
| [x] | Quote: combine indexer best bid/ask + SDK `getQuote` / market order simulation |
| [x] | Extend `query_chain`: `swap_quote` with `{ pool_key, amount, side, pay_with_deep? }` |
| [x] | `execute_transaction` action: `swap` (alias `deepbook_swap`) |
| [x] | Build PTB: direct wallet swap via `swapExactQuantity` (SDK `DeepBookContract`) |
| [x] | Extend `transaction-approval.service.ts` — `swapRequiresApproval` using notional in SUI/USDC |
| [x] | Return structured result: `{ digest, pool, in_amount, out_amount, fee_deep?, price }` |
| [x] | Agent prompt hints: default pool `SUI_USDC`, respect `lot_size` / `min_size` |
| [x] | Integration test: quote + build (dry-run/dev-inspect) on testnet |

### Client

| Status | Task |
| ------ | ---- |
| [x] | Approval modal: show swap pair, estimated out, slippage note, DEEP fee option |
| [x] | Chat tool receipt card for swaps (pair, amounts, explorer link) |
| [x] | `lib/chat-messages.ts` — format `swap` tool results |

---

## Phase E — Orders

> Limit/market orders, cancel, open-order reads.

### Backend

| Status | Task |
| ------ | ---- |
| [x] | `execute_transaction` actions: `deepbook_place_limit_order`, `deepbook_place_market_order`, `deepbook_cancel_order`, `deepbook_cancel_orders`, `deepbook_cancel_all_orders`, `deepbook_modify_order`, `deepbook_withdraw_settled_amounts`, `deepbook_withdraw_settled_amounts_permissionless` |
| [x] | Params: `pool_key`, `client_order_id`, `price`, `quantity`, `is_bid`, `pay_with_deep` |
| [x] | Extend `query_chain`: `deepbook_open_orders` (SDK `accountOpenOrders` + order details) |
| [x] | Indexer reads: `/orders/:pool/:balance_manager_id`, `/order_updates/:pool` for history |
| [x] | Approval: limit orders with locked notional above threshold |
| [x] | Validate tick/lot/min size before build (clear `VALIDATION_ERROR` messages) |

### Client

| Status | Task |
| ------ | ---- |
| [x] | Approval modal variant for limit orders (price, size, side, time-in-force if added) |
| [x] | Chat receipt for place/cancel/modify/claim with order id |
| [ ] | Optional: “Open orders” panel under agent wallet (list from API) |

---

## Phase F — Flash loans

> Atomic borrow/repay in one PTB. Off by default in permissions. **F2 (multi-step bundle + flash auto-approve):** [flash-loan-bundle-TODO.md](./flash-loan-bundle-TODO.md)

### Backend

| Status | Task |
| ------ | ---- |
| [x] | `execute_transaction` action: `deepbook_flash_loan` |
| [x] | Params: `pool_key`, `borrow_amount`, `asset`/`coin_key`, `strategy: round_trip` |
| [x] | `allow_flash_loans` permission gate — reject if false |
| [x] | **Always** `approval_required` (ignore auto-approve) — *superseded by F2 `auto_approve_flash_loans`* |
| [x] | Agent prompt: flash loans are advanced; confirm user intent |
| [x] | Tests: validation only (no mainnet execution in CI) |

### Client

| Status | Task |
| ------ | ---- |
| [x] | Settings toggle: “Allow flash loans” (default off) |
| [x] | Distinct approval modal warning (atomic, repay-or-revert) |

---

## Phase G — Staking (DEEP)

> Stake DEEP in pools for fee discounts and maker rebates.

### Backend

| Status | Task |
| ------ | ---- |
| [ ] | `execute_transaction`: `deepbook_stake`, `deepbook_unstake` |
| [ ] | Extend `query_chain`: `deepbook_stake_balance`, `deepbook_stake_required` (per pool) |
| [ ] | Indexer: use pool summary / on-chain reads for stake status |
| [ ] | Approval for stake/unstake amounts above threshold |

### Client

| Status | Task |
| ------ | ---- |
| [ ] | Chat receipt for stake/unstake |
| [ ] | Optional: show staked DEEP + fee tier hint in wallet section |

---

## Phase H — Governance

> Proposals, votes, epoch parameters.

### Backend

| Status | Task |
| ------ | ---- |
| [ ] | `execute_transaction`: `deepbook_submit_proposal`, `deepbook_vote` |
| [ ] | Extend `query_chain`: `deepbook_governance_state` — leading proposal, quorum, next-epoch fees |
| [ ] | Respect `allow_governance` permission |
| [ ] | Approval for governance txs (lower risk but still on-chain writes) |

### Client

| Status | Task |
| ------ | ---- |
| [ ] | Settings toggle: “Allow governance actions” |
| [ ] | Approval modal: proposal params or vote choice |

---

## Phase I — Indexer depth (time-series & streaming)

> Use public indexer for v1; optional self-hosted for ops control.

### Backend (public indexer — recommended v1)

| Status | Task |
| ------ | ---- |
| [ ] | Historical volume: `/historical_volume/:pools`, `/all_historical_volume` |
| [ ] | Per-user volume: `/historical_volume_by_balance_manager_id` (+ `_with_interval`) |
| [ ] | Trades: `/trades/:pool` with `start_time`, `end_time`, `limit` |
| [ ] | OHLCV: `/ohclv/:pool?interval=1h` for charts |
| [ ] | Health: `/status` — expose lag in admin/metrics |
| [ ] | Extend `query_chain`: `deepbook_trades`, `deepbook_volume`, `deepbook_ohlcv` |
| [ ] | `GET /api/v1/defi/pools/:pool/ohlcv` — optional REST for UI |
| [ ] | Cache hot paths (Redis): ticker, orderbook L1, 30–60s TTL |

### Backend (self-hosted indexer — optional)

| Status | Task |
| ------ | ---- |
| [ ] | Document runbook: `deepbook-indexer` crate, `DATABASE_URL`, `--env mainnet --packages deepbook` |
| [ ] | Docker Compose service or separate deploy; **do not** block MVP on this |
| [ ] | Ingest webhooks or poll into Postgres if proprietary analytics needed |

### Client

| Status | Task |
| ------ | ---- |
| [ ] | Agent answers “volume last 24h on SUI/USDC” via tool (no chart required) |
| [ ] | Optional: mini sparkline / volume stat on explorer (OHLCV endpoint) |

---

## Phase J — Agent permissions (guardrails)

> Wire Settings UI to backend; extend approval engine.

### Backend

| Status | Task |
| ------ | ---- |
| [ ] | Prisma `UserAgentPermissions` + migration |
| [ ] | `GET/PATCH /api/v1/users/me/permissions` |
| [ ] | `transaction-approval.service.ts` — load per-user prefs; fall back to env |
| [ ] | Classify actions: `transfer`, `swap`, `order`, `stake`, `governance`, `flash_loan` |
| [ ] | `flash_loan` → always approve; `swap` → respect `auto_approve_swaps` + notional cap |

### Client

| Status | Task |
| ------ | ---- |
| [ ] | Replace mock `Toggle` in settings with persisted permissions API |
| [ ] | Add toggles: auto-approve swaps, allow flash loans, allow governance |
| [ ] | Threshold input for max auto-approve SUI (and/or USD equivalent later) |
| [ ] | Approval modal reads pending tx `action` type for correct copy |

---

## Agent tool contract (extensions)

### `query_chain` — new `query` values

| Query | Params | Source |
| ----- | ------ | ------ |
| `swap_quote` | `pool_key`, `amount`, `side`, `pay_with_deep?` | SDK + indexer |
| `deepbook_pools` | — | Indexer `/get_pools` |
| `deepbook_pool_info` | `pool_key` | Indexer + SDK |
| `deepbook_ticker` | — | Indexer `/ticker` |
| `deepbook_manager_balance` | `coin_key?` | SDK |
| `deepbook_open_orders` | `pool_key` | SDK |
| `deepbook_trades` | `pool_key`, `limit`, `start_time?`, `end_time?` | Indexer |
| `deepbook_volume` | `pool_key`, `start_time`, `end_time` | Indexer |
| `deepbook_ohlcv` | `pool_key`, `interval`, `limit` | Indexer |
| `deepbook_stake_balance` | `pool_key` | SDK / on-chain |
| `deepbook_governance_state` | `pool_key` | SDK / on-chain |

### `execute_transaction` — new `action` values (Sui)

| Action | Notes |
| ------ | ----- |
| `swap` / `deepbook_swap` | Market swap |
| `deepbook_deposit` | Wallet → balance manager |
| `deepbook_withdraw` | Balance manager → wallet |
| `deepbook_place_limit_order` | |
| `deepbook_place_market_order` | |
| `deepbook_cancel_order` | `order_id` |
| `deepbook_cancel_orders` | `order_ids[]` |
| `deepbook_cancel_all_orders` | `pool_key` |
| `deepbook_modify_order` | `order_id`, `quantity` (size only) |
| `deepbook_withdraw_settled_amounts` | `pool_key` |
| `deepbook_withdraw_settled_amounts_permissionless` | `pool_key` |
| `deepbook_flash_loan` | Permission + always approve |
| `deepbook_stake` | DEEP into pool |
| `deepbook_unstake` | |
| `deepbook_submit_proposal` | Fee/stake params |
| `deepbook_vote` | `proposal_id`, `vote` |

---

## Suggested implementation order

```text
A Foundation → B Balance manager → C Pools/indexer reads → D Swap
    → J Permissions (can parallel with D)
    → E Orders → G Staking → H Governance → F Flash loans
    → I Indexer depth (ongoing after C)
```

**Rationale:** Swap delivers core product promise (“best rate via DeepBook”). Orders and staking build on balance manager. Flash loans and governance are advanced. Indexer time-series enhances quotes and agent answers but is not blocking for first swap.

---

## Testing checklist

| Area | Tests |
| ---- | ----- |
| Unit | Indexer normalizer, approval rules, param validation (tick/lot/min) |
| Integration | `ensureBalanceManager`, `swap_quote` dev-inspect on testnet |
| Agent | Stub runtime fixtures for swap pending + approved flows |
| Client | Approval modal renders swap vs transfer; settings persist |

---

## Docs & cross-links

| Doc | Action |
| --- | ------ |
| [backend/docs/TODO.md](../backend/docs/TODO.md) | Add Phase 9 pointer to this file |
| [backend/api-ref.md](../backend/api-ref.md) | Document new `query` / `action` enums + optional `/api/v1/defi/*` |
| [wallet-assets-TODO.md](./wallet-assets-TODO.md) | Shared token catalog (`/assets`); agent `token_balances` before swap |
| [README.md](../README.md) | Align Sui adapter example with real `services/defi/` layout |
| Agent system prompt | DeepBook pool keys, approval behavior, flash loan caution |

---

## Phase checklist summary

| Phase | Backend | Client | Blocker |
| ----- | ------- | ------ | ------- |
| A Foundation | SDK + defi layer | — | — |
| B Balance manager | DB + ensure + deposit/withdraw | Receipts | A |
| C Pools + indexer | Indexer client + reads | API client | A |
| D Swap | Quote + execute + approval | Approval + receipts | B, C |
| E Orders | Place/cancel + reads | Approval + open orders | B, D |
| F Flash loans | Atomic PTB + permissions | Settings + warning modal | B, J |
| G Staking | Stake/unstake + reads | Receipts | B |
| H Governance | Propose/vote + reads | Settings toggle | B, G |
| I Indexer depth | OHLCV, volume, trades queries | Optional charts | C |
| J Permissions | DB + API + approval engine | Settings wired | — |

---

*Last updated: 2026-06-12*
