# Wallet assets — implementation TODO

**“In your wallet”** — show what the user’s **Privy agent wallet** holds: native SUI, USDC, DEEP, and other popular DeepBook tokens. Profile-first UX; same data powers agent `query_chain` and swap pre-checks.

**Related:** [deepbook-v3-TODO.md](./deepbook-v3-TODO.md) (DeFi actions) · [user-profile-TODO.md](./user-profile-TODO.md) (profile shell)

**References**

- [Privy — Fetch balance via API](https://docs.privy.io/wallets/gas-and-asset-management/assets/fetch-balance) (`wallets().balance.get`)
- [Privy — Balance event webhooks](https://docs.privy.io/wallets/gas-and-asset-management/assets/balance-event-webhooks) (optional deposit notifications)
- [DeepBookV3 Indexer — `/assets`](https://docs.sui.io/onchain-finance/deepbookv3/deepbookv3-indexer)
- [Sui — `getAllBalances`](https://sdk.mystenlabs.com/typescript/sui-client#getallbalances) (Sui RPC)

---

## Product behavior

| Scenario | Expected behavior |
| -------- | ----------------- |
| User opens Profile / Settings | Sees **“In your wallet”** under profile — summary line (e.g. “3 assets · ~$142”) |
| User taps “In your wallet” | Expands to asset list: **SUI**, **USDC**, **DEEP**, … with amount + symbol |
| Zero-balance popular token | Still listed at `0` (or hidden with “Show empty” toggle — pick one in implementation) |
| User has only SUI | Shows SUI native; USDC/DEEP at 0 if using “always show popular” mode |
| Agent asks “what tokens do I have?” | `query_chain` → `token_balances` returns same catalog |
| User deposits USDC from personal wallet | List refreshes; optional webhook later |

### Placement (UI)

```text
Settings / Profile
├── UserProfileCard
├── In your wallet          ← NEW (collapsible)
│     ├── Sui agent wallet  → SUI, USDC, DEEP, WAL, …
│     ├── EVM agent wallet  → ETH, USDC (when enabled)
│     └── Solana agent wallet → SOL, USDC (when enabled)
├── Connected accounts
├── Agent wallets (existing — address, native balance, deposit)
└── …
```

**Distinction:** `AgentWalletSection` stays for **per-chain setup** (address, fund, deposit). **“In your wallet”** is the **holdings** view across tokens on the default / selected chain.

---

## Detection strategy (hybrid)

Privy and Sui use different paths. **Do not** assume one API covers all chains.

### Sui (primary — Radiant MVP)

Privy’s balance API **does not** list `sui` among supported `chain` values for named assets (`ethereum`, `base`, `solana`, …). For the Sui agent wallet, resolve balances via **Sui RPC** + a **curated token catalog**.

| Source | Role |
| ------ | ---- |
| **DeepBook indexer `GET /assets`** | Canonical list of tradeable coins (symbol, name, `contractAddress` → Sui coin type) |
| **DeepBook SDK `CoinMap`** | Fallback / dev defaults when indexer unavailable |
| **`SuiClient.getBalance`** | Per coin type for agent wallet address |
| **`SuiClient.getAllBalances`** | Optional: discover non-catalog coins user holds (advanced / “Other” row) |

**Popular tokens (MVP display order):** `SUI` (native), `USDC` (Native USDC), `DEEP`, `WAL`, `USDT` — extend from indexer `/assets`; sort with `WALLET_ASSET_PRIORITY` env or static config.

### EVM & Solana agent wallets (when enabled)

Use **Privy** server-side balance API with stored `privy_wallet_id`:

```typescript
// Named assets — Privy Node SDK
await privy.wallets().balance.get(privyWalletId, {
  asset: ["usdc", "eth"],  // usdc, usdt, eth, pol, sol, …
  chain: ["ethereum", "base"],
  include_currency: "usd",
});

// Custom ERC-20 / SPL — up to 10 per request
await privy.wallets().balance.get(privyWalletId, {
  token: ["base:0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"],
});
```

Supported named assets (Privy): `usdc`, `usdc.e`, `eth`, `pol`, `usdt`, `eurc`, `usdb`, `sol`.

### Caching

| Layer | Policy | Notes |
| ----- | ------ | ----- |
| Backend API | **No cache** | Always fresh on request; client owns session cache |
| Client session (`wallet-session-cache.ts`) | Until logout | Fetch once when profile/settings opens; manual **Refresh** only |
| Agent wallet balances (`AgentWalletProvider`) | In-memory per session | Loaded at login provisioning; **Refresh balances** button only |

---

## Architecture

```text
Client — “In your wallet” panel
    │
    └── GET /api/v1/wallets/assets?chain=sui
            │
            ▼
services/wallet/wallet-assets.service.ts
    │
    ├── chain === sui
    │     ├── token-catalog.service.ts     ← indexer /assets + priority list
    │     └── sui-coin-balances.ts           ← SuiClient parallel getBalance
    │
    └── chain === ethereum | solana
          └── privy-balance.service.ts       ← privy.wallets().balance.get(...)
            │
            ▼
Agent query_chain.query = "token_balances"   (same service)
```

**Existing code to extend**

| Today | Gap |
| ----- | --- |
| `GET /api/v1/wallets/balances` | Native only (`balance_display`, one symbol) |
| `AgentWalletSection` | Shows native balance per chain |
| `privy_wallet_id` on `AgentWallet` | Ready for Privy balance API on EVM/SOL |

---

## API contract

### `GET /api/v1/wallets/assets`

Auth: `privy-token` cookie. Resolves agent wallet from session (never pass address in body).

**Query**

| Param | Default | Notes |
| ----- | ------- | ----- |
| `chain` | `sui` | `sui` \| `ethereum` \| `solana` |
| `evm_chain_id` | — | When `chain=ethereum` |
| `include_zero` | `true` | Include popular tokens with 0 balance |
| `include_usd` | `true` | Fiat estimate where available (Privy / future price feed) |

**Response**

```json
{
  "success": true,
  "data": {
    "chain_id": "sui",
    "address": "0x…",
    "total_usd": 142.5,
    "assets": [
      {
        "symbol": "SUI",
        "name": "Sui",
        "coin_type": "0x2::sui::SUI",
        "balance_atomic": "1500000000",
        "balance_display": 1.5,
        "decimals": 9,
        "usd_value": 5.13,
        "source": "sui_rpc",
        "popular": true
      },
      {
        "symbol": "USDC",
        "name": "Native USDC",
        "coin_type": "0x…::usdc::USDC",
        "balance_atomic": "25000000",
        "balance_display": 25.0,
        "decimals": 6,
        "usd_value": 25.0,
        "source": "sui_rpc",
        "popular": true
      }
    ],
    "updated_at": "2026-06-11T…"
  }
}
```

### Agent: `query_chain`

Extend `query` enum:

| Query | Params | Returns |
| ----- | ------ | ------- |
| `token_balances` | `chain_id`, `include_zero?` | Same shape as `/wallets/assets` |

---

## Token catalog

### `services/defi/token-catalog.service.ts` (or `services/wallet/`)

| Status | Task |
| ------ | ---- |
| [x] | Fetch DeepBook indexer `/assets` on startup + periodic refresh (e.g. 1h) |
| [x] | Map `asset_type` → Sui coin type (from indexer; `contractAddress` is package id) |
| [x] | `POPULAR_ASSET_SYMBOLS` — `SUI`, `USDC`, `DEEP`, `WAL`, `USDT`, … (`WALLET_POPULAR_SYMBOLS` env) |
| [x] | Expose `getCatalogForWallet()` → ordered list for balance queries |
| [x] | Unit tests: indexer mock, fallback when indexer down |

### Scalars

Reuse DeepBook indexer asset scalars (see [deepbook-v3-TODO.md](./deepbook-v3-TODO.md) Phase I) for `balance_display` conversion.

---

## Phase A — Backend: Sui multi-asset balances

| Status | Task |
| ------ | ---- |
| [x] | `services/wallet/sui-coin-balances.ts` — batch `getBalance` for catalog coin types |
| [x] | `services/wallet/wallet-assets.service.ts` — orchestrate catalog + balances |
| [x] | `GET /api/v1/wallets/assets` route + Zod schemas |
| [x] | Client session cache (no backend Redis for wallet assets) |
| [x] | Extend `query_chain` with `token_balances` |
| [x] | Tests: mock SuiClient, empty wallet, partial holdings |

---

## Phase B — Backend: Privy balances (EVM / Solana)

| Status | Task |
| ------ | ---- |
| [x] | `services/wallet/privy-balance.service.ts` — `getPrivyClient().wallets().balance.get` |
| [x] | Map Privy response → unified `WalletAsset` type |
| [x] | Wire `privy_wallet_id` from `AgentWallet` row |
| [x] | Named assets per chain: EVM `eth`+`usdc`+`usdt`; Solana `sol`+`usdc` |
| [x] | Tests: mock Privy client |

---

## Phase C — Client: “In your wallet” UI

| Status | Task |
| ------ | ---- |
| [x] | `lib/wallet-assets-api.ts` — `fetchWalletAssets(chain?)` |
| [x] | `components/profile/InYourWalletSection.tsx` — collapsible, below `UserProfileCard` |
| [x] | Asset row: icon/initial, symbol, name, balance, optional USD |
| [x] | Loading skeleton; error retry |
| [x] | Mount on Settings profile section (and optionally sidebar profile popover later) |
| [x] | Refresh after successful deposit dialog |
| [x] | Link “Fund wallet” → existing deposit flow when all zeros |

### UX details

- **Collapsed:** “In your wallet · 1.5 SUI, 25 USDC” (top 2 non-zero or native)
- **Expanded:** full list sorted: non-zero first, then popular zeros
- **Empty wallet:** “No assets yet” + CTA to deposit SUI

---

## Phase D — Agent & DeepBook integration

| Status | Task |
| ------ | ---- |
| [ ] | Agent prompt: user balances available via `token_balances`; prefer USDC/SUI for swaps |
| [ ] | Before swap: agent checks `token_balances` for sufficient input |
| [ ] | Chat receipt: show post-swap asset deltas (optional) |
| [ ] | DeepBook balance manager deposits: separate from wallet holdings (see deepbook Phase B) |

---

## Phase E — Optional enhancements

| Status | Task |
| ------ | ---- |
| [ ] | Privy webhooks `wallet.funds_deposited` for EVM/SOL refresh |
| [ ] | `getAllBalances` + “Other tokens” section for non-catalog coins |
| [ ] | Price feed for Sui tokens (indexer ticker / external) when `include_usd` on Sui |
| [ ] | Sidebar mini-wallet chip (total USD) |

---

## Environment variables

| Variable | Example | Purpose |
| -------- | ------- | ------- |
| `DEEPBOOK_INDEXER_URL` | `https://deepbook-indexer.mainnet.mystenlabs.com` | Token catalog `/assets` |
| `WALLET_ASSET_CACHE_TTL_SEC` | `60` | Redis TTL |
| `WALLET_POPULAR_SYMBOLS` | `SUI,USDC,DEEP,WAL,USDT` | Display order |

---

## Testing checklist

| Area | Tests |
| ---- | ----- |
| Catalog | Indexer parse; fallback symbols |
| Sui balances | Multi coin type; zero balance; RPC error → partial result |
| Privy balances | Named assets mapping; missing wallet |
| API | Auth required; 404 without agent wallet |
| Client | Collapse/expand; formats 6 vs 9 decimals |

---

## Implementation order

```text
Token catalog (indexer) → Phase A (Sui API) → Phase C (UI)
    → Phase B (Privy EVM/SOL) → Phase D (agent) → Phase E (optional)
```

**Blocks:** Agent wallet registered (Phase 3). **Parallel with:** DeepBook Phase A (shared indexer client).

---

## Cross-links

| Doc | Update |
| --- | ------ |
| [backend/docs/TODO.md](../backend/docs/TODO.md) | Phase 10 — wallet assets |
| [deepbook-v3-TODO.md](./deepbook-v3-TODO.md) | Shared token catalog + agent pre-swap checks |
| [user-profile-TODO.md](./user-profile-TODO.md) | “In your wallet” supersedes “balances out of scope” for profile |
| [backend/api-ref.md](../backend/api-ref.md) | Document `GET /api/v1/wallets/assets` |

---

*Last updated: 2026-06-11*
