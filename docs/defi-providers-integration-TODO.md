# DeFi providers integration — Li-Fi, Soroswap, SushiSwap

Composable cross-chain and multi-venue DeFi for Radiant's AI agent. One doc for backend services, chain adapters, agent tools, prompts, and client.

**References**

- Radiant architecture: [backend/docs/TODO.md](../backend/docs/TODO.md) (chain abstraction), [docs/deepbook-v3-TODO.md](./deepbook-v3-TODO.md) (DeepBook pattern)
- Agent prompts: [docs/agent-prompt-modules-TODO.md](./agent-prompt-modules-TODO.md)
- Li-Fi agents: [docs.li.fi/agents/overview](https://docs.li.fi/agents/overview)
- Li-Fi Intents: [docs.li.fi/lifi-intents/introduction](https://docs.li.fi/lifi-intents/introduction)
- Soroswap API: [api.soroswap.finance/docs](https://api.soroswap.finance/docs)
- SushiSwap API: [docs.sushi.com/api/examples/quote](https://docs.sushi.com/api/examples/quote)

**MVP principle:** Agent tools stay **chain-agnostic** (`query_chain`, `execute_transaction`). Provider specifics live in `services/defi/<provider>/` and are invoked by chain adapters — not new top-level agent tools per venue.

**Agent chain plugins (shipped):** Chain/provider logic for tool schemas and handlers lives under `backend/src/services/agent/chains/` — top-level folders `sui/`, `evm/`, `stellar/` (plus `core/` for chain-agnostic queries). Provider submodules: `sui/deepbook/`, `stellar/soroswap/`, future `evm/lifi/` and `evm/sushiswap/`. `tools/build-tool-definitions.ts` merges `ENABLED_CHAINS` + agent permissions into dynamic `query_chain` / `execute_transaction` schemas; thin routers in `tools/query-chain.tool.ts` and `execute-transaction-with-approval.ts` dispatch via `chains/registry.ts`.

**Network:** `mainnet` first; testnets via env (`LIFI_ENV`, `SOROSWAP_NETWORK`, `SUSHI_API_ENV`).

**Agent design principle:** New EVM and Stellar DeFi flows are **tool-first** — the LLM reasons with `query_chain` / `execute_transaction` and existing clarification gaps. **Do not** extend `execution-intent.ts`, `workflow-parser.ts`, or `heuristic-planner.ts` regex fast paths for Li-Fi, Soroswap, or SushiSwap. Legacy Sui regex fast paths may remain until removed separately.

---

## V1 supported chains and tokens (Radiant contract)

Provider APIs expose dozens of chains; **Radiant v1 only enables the list below**. The backend must reject out-of-scope chains **before** calling any provider API. Do not dynamically expose Li-Fi's full `/chains` catalog to users.

| Radiant chain | `chain_id` | `evm_chain_id` (if EVM) | Swap provider | Bridge provider |
| ------------- | ---------- | ----------------------- | ------------- | --------------- |
| **Sui** | `sui` | — | DeepBook | Li-Fi |
| **Solana** | `solana` | — | — | Li-Fi |
| **Ethereum** | `ethereum` | `1` | SushiSwap | Li-Fi |
| **Arbitrum** | `ethereum` | `42161` | SushiSwap | Li-Fi |
| **Base** | `ethereum` | `8453` | SushiSwap | Li-Fi |
| **Stellar** | `stellar` | — | Soroswap | — (not Li-Fi; Soroswap only) |

**Env contract**

| Variable | v1 value | Purpose |
| -------- | -------- | ------- |
| `ENABLED_CHAINS` | `sui,solana,ethereum,stellar` | Chain adapters |
| `ENABLED_EVM_CHAIN_IDS` | `1,42161,8453` | Ethereum, Arbitrum, Base only |
| `LIFI_ENABLED_CHAIN_IDS` | _(optional)_ | Override Li-Fi numeric ids; default derived from enabled chains |
| `DEFAULT_AGENT_CHAIN` | `sui` (or user preference) | Session default when chain unspecified |

**Per-chain token allowlist (v1)** — extend via config; provider discovery must be filtered through this list.

| Chain | Allowed symbols (v1) | Notes |
| ----- | -------------------- | ----- |
| Sui | SUI, USDC, DEEP, WAL | Pool-defined via DeepBook env |
| Ethereum | ETH, WETH, USDC | ERC-20 addresses in `supported-tokens.ts` |
| Arbitrum | ETH, WETH, USDC, ARB | ↑ |
| Base | ETH, WETH, USDC | ↑ |
| Solana | SOL, USDC | SPL mints in `supported-tokens.ts` |
| Stellar | XLM, USDC | Soroswap asset codes / contract addresses |

**Li-Fi chain ids (Radiant v1):** Sui `9270000000000000`, Solana `1151111081099710`, EVM ids match `ENABLED_EVM_CHAIN_IDS`.

**Bridging in v1:** Li-Fi between **Sui, Solana, and enabled EVM chains** (Ethereum, Arbitrum, Base). Stellar remains Soroswap-only — no Li-Fi routing.

---

## Product behavior

| Scenario | Expected behavior |
| -------- | ----------------- |
| User asks “swap 100 USDC to ETH on Base” | `token_resolve` → `evm_swap_quote` (Sushi, `evm_chain_id: 8453`) → `execute_transaction` `evm_swap` → approval → Privy EVM sign |
| User asks “bridge USDC from Ethereum to Arbitrum” | `token_resolve` → `cross_chain_quote` (Li-Fi) → approval → source-chain tx → poll `cross_chain_status` |
| User asks “bridge USDC from Sui to Base” | `token_resolve` → `cross_chain_quote` with `chain_id: sui`, `to_chain_id: ethereum`, `to_evm_chain_id: 8453` → `cross_chain_swap` on source chain |
| User asks “bridge SOL from Solana to Arbitrum” | Same Li-Fi path with `chain_id: solana` and `to_evm_chain_id: 42161` |
| User asks “swap 50 XLM to USDC on Stellar” | `token_resolve` → `stellar_swap_quote` (Soroswap) → `execute_transaction` `stellar_swap` → Privy `rawSign` |
| User asks “swap 50 XLM to USDC on Base” | Backend returns `CROSS_ECOSYSTEM_NOT_SUPPORTED` — explain Stellar-only swap vs EVM bridge options; **no** Soroswap or Li-Fi call |
| User writes “swap 50 shot to eth” | `token_resolve("shot")` → no match → clarification (“Did you mean USDC?”) — **never** silent regex typo mapping |
| User asks “what chains can I bridge to?” | `query_chain` → `supported_chains` (Radiant allowlist) + `cross_chain_connections` (Li-Fi, filtered to enabled EVM ids) |
| User on Sui asks to swap | Existing DeepBook path — **unchanged**; provider router must not override Sui defaults |

### Explicitly out of scope (v1)

- Li-Fi **Intents** order server (escrow / EIP-712 signed orders) — Phase L (advanced cross-chain)
- Soroswap liquidity provision / LP management UI
- Sushi clAMM / cpAMM LP positions
- **Cross-ecosystem orchestration** (Stellar ↔ EVM multi-leg, e.g. XLM → USDC on Base) — **Phase 8 (final)**; requires all provider services complete
- EVM chains outside `ENABLED_EVM_CHAIN_IDS` (Polygon, Optimism, BSC, etc.) even if Li-Fi/Sushi support them
- Running Li-Fi or Sushi MCP servers inside Radiant runtime (we wrap REST in backend services)
- Regex-based intent parsing for new providers — tool-first agent only

---

## Architecture

```text
Client (chat, settings, optional DeFi panels)
    │
    ├── POST /api/v1/chat                    (agent: query_chain, execute_transaction)
    └── GET  /api/v1/defi/...                (optional REST for UI — quotes, status)
            │
            ▼
services/agent/
    ├── query-chain.tool.ts                  extend query enum (provider-aware)
    ├── execute-transaction.tool.ts          extend actions per chain
    ├── prompts/protocols/{lifi,soroswap,sushiswap}/
    ├── prompts/module-triggers.ts           scoped prompt injection
    └── transaction-approval.service.ts      extend for cross-chain notional
            │
            ▼
services/defi/                               composable DeFi layer (plug-and-play)
    ├── types.ts                               shared SwapQuote, RouteQuote, ProviderId
    ├── swap-registry.ts                       route quote/build by provider + chain
    ├── deepbook/                              existing Sui venue (reference)
    ├── lifi/                                  cross-chain + EVM aggregator fallback
    ├── soroswap/                              Stellar / Soroban aggregator
    └── sushiswap/                             same-chain EVM aggregator
            │
            ▼
services/chains/
    ├── registry.ts
    └── adapters/
        ├── sui.ts                             DeepBook via defi/deepbook
        ├── evm.ts                             Sushi (same-chain) + Li-Fi (cross-chain)
        └── stellar.ts                         NEW — Soroswap via defi/soroswap
            │
            ▼
infrastructure/
    ├── evm/client.ts                          viem (existing)
    ├── stellar/client.ts                      NEW — Horizon + Soroban RPC
    └── rate-limit/token-bucket.ts             per-provider buckets (existing pattern)
```

**Key rules**

1. **One folder per provider** under `services/defi/` — mirror `deepbook/` layout (client, services, types, errors).
2. **Chain adapter** picks provider: same-chain EVM → Sushi; cross-chain EVM (enabled ids) → Li-Fi; Stellar → Soroswap; Sui → DeepBook.
3. **Allowlist first** — reject chains/tokens outside v1 before any provider HTTP call.
4. **No provider SDK in routes** — HTTP/SDK clients live in `services/defi/<provider>/` only; Li-Fi uses `@lifi/sdk` in that layer, not in `src/api/`.
5. **Prompt modules** are scoped per provider (`protocol:lifi:*`, `protocol:soroswap:*`, `protocol:sushiswap:*`).
6. **Tool-first for new providers** — no regex swap parsers for EVM/Stellar; use `token_resolve` + clarification.
7. **Cache read paths, not execute** — catalogs and quotes are cached per Phase 0.6; execution always re-validates.

---

## Li-Fi integration mode recommendation

Li-Fi docs describe three agent-facing surfaces. **“Resolve” is not a separate integration mode** — it refers to token/chain resolution inside quote and route APIs (`GET /v1/token`, symbol → address in `/quote`).

| Mode | What it is | Radiant fit |
| ---- | ---------- | ----------- |
| **Aggregator REST API** (`https://li.quest/v1`) | Classic routing across 27+ bridges and 31+ DEXes; `GET /quote` returns `transactionRequest` | **REST fallback** — SDK wraps the same API |
| **Intents API** (`https://order.li.fi`) | Intent-based cross-chain; solvers fill orders; EIP-712 signed orders, escrow/resource locks | Phase L — advanced cross-chain |
| **MCP Servers** (`mcp.li.quest`, Intents MCP) | Hosted tool discovery for external MCP hosts (Cursor, Claude) | **Do not use in production** — Radiant owns `query_chain` / `execute_transaction` |

### Recommendation: **SDK-first + REST fallback** (not MCP, not Intents for v1)

Radiant Phase 1 uses **`@lifi/sdk`** with **`@lifi/sdk-provider-ethereum`**, **`@lifi/sdk-provider-sui`**, and **`@lifi/sdk-provider-solana`** for quotes, multi-route comparison, step transactions, status, and `executeRoute`. **`lifiRestFetch`** in `lifi.client.ts` calls `https://li.quest/v1` when the SDK lacks a parameter or for `/advanced/*` edge cases. **Signing is always via Privy** (viem for EVM, Mysten Signer for Sui, wallet-standard adapter for Solana) — no private keys on the server.

| Layer | Surface | Radiant usage |
| ----- | ------- | ------------- |
| **SDK** | `getQuote`, `getRoutes`, `getStepTransaction`, `getStatus`, `executeRoute` | Primary path in `services/defi/lifi/` |
| **REST fallback** | `lifiRestFetch(path)` → `https://li.quest/v1` | Advanced `/advanced/*`, missing SDK params |
| **Intents API** | `https://order.li.fi` | Phase L — deferred |
| **MCP** | `mcp.li.quest` | Do not use in production |

**Rationale**

1. **Matches existing Radiant pattern** — DeepBook flow is quote (`query_chain`) → approve → sign (`execute_transaction`). Li-Fi `/quote` returns unsigned `transactionRequest` compatible with Privy EVM `createViemAccount`.
2. **Server-side control** — Radiant can enforce per-user rate limits (`token-bucket`), map errors to `AppError`, audit logs, and approval thresholds before any outbound Li-Fi call.
3. **Cross-chain status** — `GET /v1/status` supports polling after source-chain broadcast; fits agent receipt + notification rules.
4. **Intents add complexity** — separate order lifecycle (Signed → Delivered → Settled), EIP-712 signing, escrow deposits, solver exclusivity. Better as Phase L when basic bridging works.
5. **MCP is wrong layer** — Radiant is the agent host; wrapping REST in `services/defi/lifi/` avoids duplicate tool surfaces and keeps Privy signing on the backend.

**When to add Intents (Phase L):** stablecoin-heavy cross-chain where solver-fronted liquidity beats bridge aggregation; exact-output requirements; gasless off-chain order submission.

**API key:** Register at [portal.li.fi](https://portal.li.fi). Without key: 200 req / 2 h. With key: 200 req / min.

---

## Provider capability matrix

### Li-Fi (cross-chain / EVM aggregator)

| Capability | Details |
| ---------- | ------- |
| **Supported chains** | **58 chains** across EVM, Solana, Bitcoin, Sui (per [agents overview](https://docs.li.fi/agents/overview)). Common EVM: Ethereum (1), Arbitrum (42161), Optimism (10), Base (8453), Polygon (137), BSC (56), Avalanche (43114). Non-EVM: Solana, Bitcoin, Sui. **Stellar is not supported.** |
| **Supported tokens** | Dynamic — `GET /v1/tokens?chains=1,42161` returns per-chain lists (`address`, `symbol`, `decimals`). `GET /v1/token?chain=&token=` resolves symbol or address. Prefer API discovery over hardcoding. |
| **Bridge support** | **Yes** — aggregates 27+ bridges (e.g. Stargate, Across, Hop, etc.). `GET /v1/tools` lists current `bridges` and `exchanges` with `supportedChains`. |
| **Same-chain swap** | **Yes** — via included DEX steps in routes |
| **Cross-chain** | **Yes** — primary use case; single-step (`/quote`) or multi-step (`/advanced/routes` + `/advanced/stepTransaction`) |
| **Transaction data** | `transactionRequest` in quote response (EVM hex fields) |
| **Status tracking** | `GET /v1/status?txHash=&fromChain=&toChain=&bridge=` |
| **Rate limits** | 200 / 2 h (no key); 200 / min (with `x-lifi-api-key`) |
| **Radiant chain mapping** | `chain_id: ethereum` + `evm_chain_id`; **v1 enabled:** `1`, `42161`, `8453` only |
| **Radiant v1 scope** | Bridge/swap between Ethereum, Arbitrum, Base; Sui via separate Li-Fi path if needed later — **not** Stellar |

### SushiSwap (EVM aggregator)

| Capability | Details |
| ---------- | ------- |
| **Supported chains** | **40+ EVM chains** (dynamic — do not hardcode). Discover via SDK `SWAP_API_SUPPORTED_CHAIN_IDS` or OpenAPI schema. Examples: Ethereum, Arbitrum, Base, Polygon, Optimism, Avalanche, BSC, Linea, Scroll, zkSync, Sonic, etc. See [Sushi FAQ](https://www.sushi.com/faq/general/about-sushi/which-chains-are-sushi-on). **No Stellar / Soroban.** |
| **Supported tokens** | Per-chain via `/token/v1/{chainId}/{tokenAddress}` and quote endpoints; pricing via `/price/v1/{chainId}`. |
| **Bridge support** | **No** (aggregator only). Cross-chain via separate SushiXSwap product — **out of v1 scope**; use Li-Fi for bridges. |
| **Same-chain swap** | **Yes** — primary use case (`/quote/v7/{chainId}`, `/swap/v7/{chainId}`) |
| **Cross-chain** | SushiXSwap (25+ chains) — defer; Li-Fi covers Radiant cross-chain |
| **Transaction data** | Swap API returns executable calldata for RouteProcessor |
| **API auth** | API key required for production rate limits; errors: `invalid-api-key`, `ratelimit-exceeded` ([API errors](https://docs.sushi.com/api/errors)) |
| **Radiant chain mapping** | `chain_id: ethereum` + `evm_chain_id` — overlap with `backend/src/config/evm.ts` |
| **Radiant v1 scope** | Same-chain swap on `evm_chain_id` ∈ `{1, 42161, 8453}` only |

### Soroswap (Stellar / Soroban)

| Capability | Details |
| ---------- | ------- |
| **Supported chains** | **Stellar mainnet + testnet** (`network: mainnet \| testnet`). Soroban smart contracts on Stellar. |
| **Supported tokens** | `GET /api/tokens` — per-network asset list (contract address, code, decimals). `GET /assetlist` for curated lists. Mainnet list may be sparse in API — use asset lists + user-provided contract addresses. |
| **Bridge support** | **Not native in Soroswap API.** Ecosystem bridges (Allbridge Core, Circle CCTP, Axelar) exist separately — **out of v1**; cross-chain Stellar ↔ EVM needs Li-Fi + bridge orchestration (deferred). |
| **Same-chain swap** | **Yes** — aggregator across Soroban AMMs: Soroswap, Phoenix, Aqua; SDEX referenced in API protocols list |
| **Protocols (mainnet)** | `soroswap`, `phoenix`, `aqua` (per `/health` indexer) |
| **Quote → Build → Send** | `POST /quote` → `POST /quote/build` (unsigned XDR) → sign → `POST /quote/send` or broadcast via Horizon/Soroban RPC |
| **Extras** | Gasless trustlines, platform fees (`feeBps`), split routing (`parts`), liquidity add/remove |
| **API auth** | Bearer API key (`POST /api-keys/generate` after login) |
| **Radiant chain mapping** | **New** `chain_id: stellar` (not in `CHAIN_IDS` today) |
| **Radiant v1 scope** | Stellar mainnet swaps only; tokens filtered through allowlist |

---

## Blockers and prerequisites

| Blocker | Impact | Resolution phase |
| ------- | ------ | ---------------- |
| **No `stellar` in `CHAIN_IDS`** | Soroswap cannot execute | Phase 0 |
| **No Stellar chain adapter** | No balance reads or tx broadcast | Phase 0 |
| **Privy Stellar is Tier 2** (`rawSign` only) | Must build/simulate XDR in backend, not `sendTransaction` | Phase 0 — follow [Privy Tier 2 recipe](https://docs.privy.io/recipes/use-tier-2) |
| **Soroswap API key** | Production quotes require auth | Phase 2 — ops setup |
| **Li-Fi + Sushi API keys** | Avoid 200/2h throttle in production | Phase 1 / 3 — ops setup |
| **EVM token approvals** | Swaps need ERC-20 `approve` before swap tx | Phase 1 / 3 — approval sub-flow |
| **Cross-chain multi-step** | Dest-chain swap after bridge may need second agent turn | Phase 1 — document in prompts; Phase 8 orchestration |
| **`ENABLED_EVM_CHAIN_IDS` not enforced** | Agent could quote Polygon/Base/etc. outside v1 | Phase 0 — allowlist guard |

---

## Implementation phase order

Build in this order. **Cross-ecosystem routing is last** — only after every provider service works in isolation.

| Phase | Scope | Depends on |
| ----- | ----- | ---------- |
| **0** | Chain allowlist, token allowlist, Stellar adapter, defi registry, **caching layer** | — |
| **1** | Li-Fi (EVM cross-chain: ETH ↔ Arbitrum ↔ Base) | 0 |
| **2** | Soroswap (Stellar same-chain swaps) | 0 |
| **3** | SushiSwap (EVM same-chain: ETH, Arbitrum, Base) | 0 |
| **4** | Simple provider router (deterministic rules, no multi-leg) | 1, 2, 3 |
| **5** | Agent DeFi guardrails (token resolve, typos, clarification) | 1, 2, 3 |
| **6** | Client + optional REST API | 4 |
| **7** | Security and ops | 4 |
| **8** | **Cross-ecosystem route planner** (Stellar ↔ EVM, multi-leg, `route_quote`) — **final** | 0–7 |
| **L** | Li-Fi Intents (deferred advanced) | 1 |

**Recommended build order:** 0 → 3 (Sushi, reuses EVM) → 1 (Li-Fi) → 2 (Soroswap) → 4 → 5 → 6 → 7 → **8**.

---

## Shared foundation (Phase 0)

> Chain + DeFi registry scaffolding. No agent-facing swaps yet.

### 0.1 Extend chain catalog

| Status | Task | Owner |
| ------ | ---- | ----- |
| [x] | Add `stellar` to `CHAIN_IDS` in `backend/src/services/chains/types.ts` | [Backend] |
| [x] | `backend/src/config/chains.ts` — `stellar` row: RPC URLs, native symbol `XLM`, Privy `chain_type: stellar` | [Backend] |
| [x] | `backend/src/config/stellar.ts` — `STELLAR_NETWORK`, `HORIZON_URL`, `SOROBAN_RPC_URL`, `STELLAR_PASSPHRASE` | [Backend] |
| [x] | Env vars in `backend/.env.example` | [Backend] |
| [x] | Client: `NEXT_PUBLIC_ENABLED_AGENT_CHAINS` includes `stellar` when ready | [Client] |
| [x] | `ENABLED_EVM_CHAIN_IDS` env — default `1,42161,8453` (Ethereum, Arbitrum, Base) | [Backend] |
| [x] | `getEnabledEvmChainIds()` in `backend/src/config/evm.ts` — filter `EVM_NETWORKS` to allowlist | [Backend] |
| [x] | Reject `evm_chain_id` not in allowlist → `CHAIN_NOT_ENABLED` before provider calls | [Backend] |

**Error handling**

| Status | Task |
| ------ | ---- |
| [x] | `STELLAR_CHAIN_NOT_CONFIGURED` — missing RPC / network env |
| [x] | `CHAIN_NOT_SUPPORTED` — agent requests disabled chain |
| [x] | `CHAIN_NOT_ENABLED` — valid EVM id but outside `ENABLED_EVM_CHAIN_IDS` (e.g. Polygon) |
| [x] | Map Horizon/Soroban RPC timeouts → `STELLAR_RPC_UNAVAILABLE` (503) |

**Rate limiting**

| Status | Task |
| ------ | ---- |
| [x] | `backend/src/infrastructure/stellar/rpc-retry.ts` — detect 429 / rate limit strings; map → `STELLAR_RPC_RATE_LIMITED` |
| [x] | Extend `mapAgentToolError` in `backend/src/utils/agent-tool-errors.ts` for Stellar RPC codes |

### 0.1b Client wallet provisioning UI

| Status | Task | Owner |
| ------ | ---- | ----- |
| [x] | `client/src/lib/evm-chains.ts` — `NEXT_PUBLIC_ENABLED_EVM_CHAIN_IDS` (mirror backend) | [Client] |
| [x] | Settings wallet section: provision missing wallets when user opens agent wallet UI | [Client] |
| [x] | Multi-chain address overview (all enabled chain families) | [Client] |
| [x] | EVM network picker (Ethereum / Arbitrum / Base) for assets — same `0x` address | [Client] |
| [x] | Stellar deposit dialog (direct address copy) | [Client] |
| [x] | Client `.env.example` — v1 multi-chain env block | [Client] |

### 0.2 Stellar chain adapter

| Status | Task | Owner |
| ------ | ---- | ----- |
| [x] | `backend/src/infrastructure/stellar/client.ts` — Horizon + Soroban RPC clients | [Backend] |
| [x] | `backend/src/services/chains/adapters/stellar.ts` — `getBalance`, `executeTransaction` | [Backend] |
| [x] | `backend/src/services/wallet/stellar-signing.service.ts` — Privy `rawSign` + attach signature to XDR | [Backend] |
| [x] | `backend/src/services/wallet/stellar-transaction.service.ts` — simulate, hash, broadcast | [Backend] |
| [x] | Register in `backend/src/services/chains/registry.ts` | [Backend] |
| [x] | `tests/unit/chains/stellar.adapter.test.ts` | [Backend] |

**Error handling**

| Status | Task |
| ------ | ---- |
| [x] | `stellar.errors.ts` — map Soroban simulation failures (`tx_failed`, `op_no_trust`, insufficient XLM for fees) |
| [x] | `INSUFFICIENT_BALANCE` — trustline missing → user message suggests opening trustline or gasless flow |
| [x] | `STELLAR_SIGNING_FAILED` — Privy rawSign errors |
| [x] | `TRANSACTION_FAILED` — Horizon `failed` / `error_result` with excerpt in `details` |

**Rate limiting**

| Status | Task |
| ------ | ---- |
| [x] | Wrap Soroban RPC simulate/submit in `withStellarRpcRetry` (mirror `infrastructure/sui/rpc-retry.ts`) |
| [x] | Per-user bucket on `execute_transaction` when `chain_id=stellar` (e.g. 10/min) via existing `token-bucket` |

### 0.3 Shared DeFi types and registry

| Status | Task | Owner |
| ------ | ---- | ----- |
| [x] | Extend `DeFiProviderId` in `backend/src/services/defi/deepbook/types.ts` → move to `backend/src/services/defi/types.ts` | [Backend] |
| [x] | Add ids: `evm-lifi`, `evm-sushiswap`, `stellar-soroswap` (keep `sui-deepbook`) | [Backend] |
| [x] | Extend `backend/src/services/defi/swap-registry.ts` — `getProviderForSwap({ chain_id, cross_chain })` router | [Backend] |
| [x] | `RouteQuote` type for cross-chain (steps, bridges, estimated duration) | [Backend] |
| [x] | `tests/unit/defi/swap-registry.test.ts` — routing rules | [Backend] |

**Error handling**

| Status | Task |
| ------ | ---- |
| [x] | `DEFI_PROVIDER_NOT_FOUND` — unknown provider id (existing) |
| [x] | `DEFI_ROUTE_NOT_FOUND` — no provider for chain/capability combo |
| [x] | `CROSS_ECOSYSTEM_NOT_SUPPORTED` — stellar ↔ evm until Phase 8 |

**Rate limiting**

| Status | Task |
| ------ | ---- |
| [x] | `backend/src/services/defi/rate-limit.ts` — shared helper `consumeDefiProviderQuota(userId, providerId, cost)` wrapping `tryConsumeTokenBucket` |

### 0.4 Provider config files

| Status | Task | Owner |
| ------ | ---- | ----- |
| [x] | `backend/src/config/lifi.ts` — `LIFI_API_BASE_URL`, `LIFI_API_KEY`, `LIFI_DEFAULT_SLIPPAGE`, rate limit env | [Backend] |
| [x] | `LIFI_INTEGRATOR_FEE` — default `0.001` (0.1%); passed to Li-Fi SDK quote/route calls | `backend/src/config/lifi.ts` |
| [x] | `backend/src/config/soroswap.ts` — `SOROSWAP_API_BASE_URL`, `SOROSWAP_API_KEY`, `SOROSWAP_NETWORK`, rate limit env | [Backend] |
| [x] | `backend/src/config/sushiswap.ts` — `SUSHI_API_BASE_URL`, `SUSHI_API_KEY`, rate limit env | [Backend] |
| [x] | Document all vars in `backend/.env.example` | [Backend] |

### 0.5 Chain and token allowlists

| Status | Task | Owner |
| ------ | ---- | ----- |
| [x] | `backend/src/config/supported-tokens.ts` — per-chain symbol → address/code map for v1 tokens | [Backend] |
| [x] | `validateTokenAllowed(chain_id, evm_chain_id?, symbol)` — reject unknown symbols | [Backend] |
| [x] | `resolveTokenSymbol(chain_id, userInput)` — exact match + fuzzy suggestions (no silent execute) | [Backend] |
| [x] | `getSupportedChains()` — returns Radiant v1 chain list for agent / REST | [Backend] |
| [x] | Filter Li-Fi `/chains` and Sushi chain lists through `ENABLED_EVM_CHAIN_IDS` | [Backend] |
| [x] | `tests/unit/config/supported-tokens.test.ts` | [Backend] |

**Error handling**

| Status | Task |
| ------ | ---- |
| [x] | `TOKEN_NOT_RECOGNIZED` — user input does not match any allowlisted symbol (e.g. "shot") |
| [x] | `TOKEN_NOT_SUPPORTED` — symbol known globally but not on v1 allowlist |
| [x] | `TOKEN_AMBIGUOUS` — symbol valid on multiple enabled chains without `evm_chain_id` |
| [x] | `CROSS_ECOSYSTEM_NOT_SUPPORTED` — source chain ecosystem ≠ dest (e.g. stellar → base) |

**Rate limiting**

| Status | Task |
| ------ | ---- |
| [x] | `token_resolve` query: 60 / min per user (lightweight, cache 30 s per input) |

**Exit criteria:** `stellar` adapter passes balance read on testnet; swap-registry routes by chain; configs validate at boot; requests for Polygon/Base-outside-allowlist/Base-in-allowlist behave correctly.

### 0.6 Caching strategy

> Reuse `backend/src/infrastructure/redis/cache.ts` (`cacheGet`, `cacheSet`, `cachedFetch`) — Redis when available, in-memory fallback. Mirror patterns from CoinGecko (`services/market/coingecko.client.ts`) and DeepBook indexer (`cachedFetch`).

**Principles**

| Rule | Detail |
| ---- | ------ |
| Catalogs | Long TTL, global/shared keys |
| Prices & RPC balances | Medium TTL, global or per-address |
| Swap / bridge quotes | Short TTL, read-only; **never** execute from stale cache |
| Execution payloads | **Never** cache (unsigned tx, XDR, calldata) |
| Errors | Do not cache error responses |
| Invalidation | Logout (client), post-tx success, manual Refresh, process restart on env change |

**TTL cheat sheet**

| Data | TTL | Scope |
| ---- | --- | ----- |
| Chain / token catalogs, bridge tools | 5–30 min | Global |
| Token metadata (address → decimals) | 1–24 h | Global |
| `token_resolve` (exact match) | 30 s – 5 min | Per input hash |
| Provider spot prices | 30–60 s | Global |
| Native RPC balances | 15–30 s | Per `chain + address` |
| Swap / bridge quotes | 5–15 s | Dedupe; include provider `expiresAt` |
| Cross-chain status | 10–30 s | Per `txHash` |

#### 0.6.1 Shared cache module

| Status | Task | Path |
| ------ | ---- | ---- |
| [x] | `backend/src/services/defi/cache.ts` — namespaced keys `defi:{provider}:{resource}:…` | [Backend] |
| [x] | `defiCachedFetch(key, ttlSeconds, fetcher)` — thin wrapper over `cachedFetch` | ↑ |
| [x] | `hashQuoteParams(params)` — stable cache key for quote dedupe | ↑ |
| [x] | Env TTLs in `backend/src/config/defi-cache.ts` (or per-provider config) | [Backend] |
| [x] | Document vars in `backend/.env.example` | [Backend] |
| [x] | `tests/unit/defi/defi-cache.test.ts` | [Backend] |

**Env (suggested defaults)**

| Variable | Default | Purpose |
| -------- | ------- | ------- |
| `DEFI_CATALOG_CACHE_TTL_SECONDS` | `600` | Chains, tokens, tools, connections |
| `DEFI_TOKEN_META_CACHE_TTL_SECONDS` | `3600` | Per-address metadata |
| `DEFI_QUOTE_CACHE_TTL_SECONDS` | `10` | Read-only swap/bridge quotes |
| `DEFI_QUOTE_DEDUPE_TTL_SECONDS` | `5` | Identical quote params |
| `DEFI_PRICE_CACHE_TTL_SECONDS` | `45` | Provider price endpoints |
| `DEFI_BALANCE_CACHE_TTL_SECONDS` | `20` | RPC native balance reads |
| `DEFI_STATUS_CACHE_TTL_SECONDS` | `15` | Li-Fi cross-chain status polls |
| `DEFI_TOKEN_RESOLVE_CACHE_TTL_SECONDS` | `30` | `token_resolve` exact matches |

#### 0.6.2 Backend caches by provider

| Status | Task | TTL | Owner |
| ------ | ---- | --- | ----- |
| [x] | Li-Fi chains (filtered to `ENABLED_EVM_CHAIN_IDS`) | 5–15 min | [Backend] |
| [x] | Li-Fi tokens per chain set | 10–30 min | [Backend] |
| [x] | Li-Fi `connections` + `tools` (bridges/DEX list) | 10–30 min | [Backend] |
| [x] | Li-Fi quotes — read dedupe only; re-validate before execute | 5–15 s | [Backend] |
| [x] | Li-Fi status per `txHash` | 10–30 s | [Backend] |
| [x] | Soroswap `/api/tokens` + asset lists | 10 min | [Backend] |
| [x] | Soroswap `/health` + protocols | 2–5 min | [Backend] |
| [x] | Soroswap quotes — read dedupe | 5 s | [Backend] |
| [x] | Sushi supported chain IDs | 24 h / boot | [Backend] |
| [x] | Sushi token metadata per `(chainId, address)` | 1–24 h | [Backend] |
| [x] | Sushi `/price/v1` batches | 30–60 s | [Backend] |
| [x] | Sushi quotes — read dedupe | 5–15 s | [Backend] |
| [x] | Radiant `getSupportedChains()` / allowlist | process lifetime | [Backend] |
| [x] | `token_resolve` (exact); fuzzy always live | 30 s | [Backend] |
| [x] | RPC balances (`/auth/me` funded check, `wallets/balances`) | 15–30 s | [Backend] |

**Quote vs execute policy (all providers)**

| Status | Task |
| ------ | ---- |
| [x] | Document: cached quotes OK for `query_chain` only |
| [ ] | `execute_transaction` must re-quote or verify `expiresAt` at approval (mirror DeepBook `quote_expires_at`) |
| [x] | Never cache execution payloads across users or requests |

**Valuation de-dupe**

| Status | Task |
| ------ | ---- |
| [ ] | CoinGecko for portfolio USD (`valuation.service`) — provider APIs for swap-specific pricing only |
| [ ] | Avoid fetching same symbol from CoinGecko + Sushi + Li-Fi in one agent turn |

#### 0.6.3 Client caches (extend existing)

| Status | Task | Path |
| ------ | ---- | ---- |
| [x] | Wallet assets per `(chainId, evmChainId)` — **existing** `wallet-session-cache.ts` | [Client] |
| [x] | Token logos — **existing** `token-metadata-cache.ts` | [Client] |
| [x] | Optional: cache `GET /api/v1/defi/chains` / `supported_chains` response | 5–10 min | [Client] |
| [x] | Clear all DeFi client caches on logout — extend `clearWalletSessionCache()` | [Client] |
| [x] | Invalidate wallet assets after swap/bridge/deposit success — **existing** `invalidateWalletAssetsForChain` | [Client] |

#### 0.6.4 Invalidation triggers

| Status | Task |
| ------ | ---- |
| [x] | User logout → `clearWalletSessionCache()` + clear token metadata |
| [x] | Successful `execute_transaction` → invalidate balances + assets for affected chain(s) |
| [x] | Settings “Refresh balances” → `invalidateAllWalletCaches()` — **existing** |
| [x] | `ENABLED_EVM_CHAIN_IDS` / `SOROSWAP_NETWORK` change → process restart (document) |
| [ ] | Phase 8 `route_quote` → short TTL only; invalidate after any leg executes |

**Exit criteria:** Catalog reads hit cache on second request; identical quotes within 5 s do not fan out to providers; `/auth/me` does not hammer RPC when called repeatedly; execute path never uses stale quote without expiry check.

---

## Phase 1 — Li-Fi (`services/defi/lifi/`)

> Cross-chain and EVM bridge aggregation. Folder mirrors `deepbook/`.

### 1.1 HTTP client

| Status | Task | Path |
| ------ | ---- | ---- |
| [x] | Li-Fi API client (fetch wrapper, API key header, timeout) | `backend/src/services/defi/lifi/lifi.client.ts` |
| [x] | Zod schemas for quote, status, chains, tokens responses | `backend/src/services/defi/lifi/lifi.types.ts` |
| [x] | Unit tests with mocked fetch | `backend/tests/unit/defi/lifi/lifi.client.test.ts` |

**Error handling**

| Status | Task | Path |
| ------ | ---- | ---- |
| [x] | `lifi.errors.ts` — map Li-Fi HTTP/body errors to `AppError` | `backend/src/services/defi/lifi/lifi.errors.ts` |
| [x] | `LIFI_RATE_LIMITED` (429) — user: “Li-Fi is rate limiting; retry shortly.” | ↑ |
| [x] | `LIFI_NO_ROUTE` (404 / no route) — suggest different token pair or amount | ↑ |
| [x] | `LIFI_VALIDATION_ERROR` (400) — pass through sanitized message | ↑ |
| [x] | `LIFI_UNAVAILABLE` (5xx / timeout) | ↑ |
| [x] | Extend `guidanceForErrorCode` in `agent-tool-errors.ts` for Li-Fi codes | `backend/src/utils/agent-tool-errors.ts` |

**Rate limiting**

| Status | Task | Path |
| ------ | ---- | ---- |
| [x] | Outbound token bucket: global + per-user (stay under 200/min with key) | `backend/src/services/defi/lifi/lifi-rate-limit.ts` |
| [x] | Env: `LIFI_RATE_LIMIT_CAPACITY`, `LIFI_RATE_LIMIT_REFILL_MS` | `backend/src/config/lifi.ts` |
| [x] | On 429 from Li-Fi: exponential backoff (max 3) before surfacing `LIFI_RATE_LIMITED` | `lifi.client.ts` |
| [x] | Status polling: max 1 req / 10 s per `txHash` per user (separate bucket) | `lifi-rate-limit.ts` |
| [x] | `LIFI_INTEGRATOR_FEE` — default 0.1%; pass `fee` to SDK `createClient` + quote/route calls | `backend/src/config/lifi.ts`, `lifi.client.ts`, quote/routes services |

### 1.2 Read services

| Status | Task | Path |
| ------ | ---- | ---- |
| [x] | `getLifiChains()` — cache 5 min | `backend/src/services/defi/lifi/lifi-chains.service.ts` |
| [x] | `getLifiTokens(chainIds)` — cache per chain set | `backend/src/services/defi/lifi/lifi-token-catalog.service.ts` |
| [x] | `getLifiConnections(fromChain, toChain)` | `backend/src/services/defi/lifi/lifi-connections.service.ts` |
| [x] | `getLifiTools()` — bridges + exchanges list | `backend/src/services/defi/lifi/lifi-tools.service.ts` |

**Error handling:** each service catches client errors; never leak API key in logs.

**Rate limiting:** read services consume 1 token from global Li-Fi bucket per call.

### 1.3 Quote service

| Status | Task | Path |
| ------ | ---- | ---- |
| [x] | `getLifiQuote(input)` — wraps `GET /v1/quote` | `backend/src/services/defi/lifi/lifi-quote.service.ts` |
| [x] | `getLifiAdvancedRoutes(input)` — multi-option routes | `backend/src/services/defi/lifi/lifi-routes.service.ts` |
| [x] | `getLifiStepTransaction(step)` — for multi-step routes | ↑ |
| [x] | Normalize to shared `RouteQuote` / `CrossChainQuote` | `backend/src/services/defi/lifi/lifi-normalize.ts` |
| [x] | Map Radiant `chain_id` ↔ Li-Fi chain id (Sui, Solana, EVM) | `backend/src/config/lifi-chains.ts`, `lifi-chain-map.ts` |
| [x] | Privy providers for Sui + Solana execute (`lifi-providers.service.ts`) | `backend/src/services/defi/lifi/lifi-providers.service.ts` |
| [x] | Agent `cross_chain_*` on `chain_id: sui` and `solana` | `backend/src/services/agent/chains/sui/index.ts`, `registry.ts` |

**Error handling**

| Status | Task |
| ------ | ---- |
| [x] | Validate `fromAddress` matches user's agent wallet for `chain_id: ethereum` |
| [x] | `INSUFFICIENT_BALANCE` when quote estimate flags insufficient funds |
| [x] | Slippage / `toAmountMin` below user threshold → `SLIPPAGE_EXCEEDED` |

**Rate limiting**

| Status | Task |
| ------ | ---- |
| [x] | Quote calls cost 2 tokens (heavier than status) |
| [x] | Per-session dedupe: identical quote params within 5 s return cached result |

### 1.4 Execute service

| Status | Task | Path |
| ------ | ---- | ---- |
| [x] | `executeLifiQuote(privyUserId, quote)` — sign `transactionRequest` via EVM adapter | `backend/src/services/defi/lifi/lifi-execute.service.ts` |
| [x] | ERC-20 approval detection via Li-Fi allowance or viem `allowance` | `backend/src/services/defi/lifi/lifi-approval.service.ts` |
| [x] | `execute_transaction` action: `cross_chain_swap` / `lifi_swap` | wire in `backend/src/services/chains/adapters/evm.ts` |
| [x] | Post-tx: start status polling job or return `status_poll_id` | `backend/src/services/defi/lifi/lifi-status.service.ts` |
| [x] | Persist cross-chain intent in agent transaction ledger | extend existing transaction history |

**Error handling**

| Status | Task |
| ------ | ---- |
| [x] | Approval tx failure → `APPROVAL_FAILED` with explorer link |
| [x] | Source tx reverted → `TRANSACTION_FAILED` + Li-Fi substatus if available |
| [x] | Status `FAILED` / `REFUNDED` → map to user-facing messages |
| [x] | Multi-step: if step 2 required on dest chain, return structured `pending_step` for agent (don't fail silently) |

**Rate limiting**

| Status | Task |
| ------ | ---- |
| [x] | Execute path: per-user max 5 cross-chain txs / hour (configurable) |
| [x] | Status polling via Inngest or internal scheduler — not unbounded agent loops |

### 1.5 Agent integration

| Status | Task | Path |
| ------ | ---- | ---- |
| [x] | `query_chain` types: `cross_chain_quote`, `cross_chain_status`, `cross_chain_connections` | `backend/src/services/agent/query-chain.tool.ts` |
| [x] | `execute_transaction` actions: `cross_chain_swap`, `lifi_approve` (if separate) | `backend/src/services/agent/execute-transaction.tool.ts` |
| [x] | Prompt module `protocol:lifi:env` | `backend/src/services/agent/prompts/protocols/lifi/env.ts` |
| [x] | Prompt module `protocol:lifi:swap` | `backend/src/services/agent/prompts/protocols/lifi/swap.ts` |
| [x] | Prompt module `protocol:lifi:bridge` | `backend/src/services/agent/prompts/protocols/lifi/bridge.ts` |
| [x] | Triggers in `module-triggers.ts` — keywords: bridge, cross-chain, Li-Fi, jumper; chains: `ethereum` | `backend/src/services/agent/prompts/module-triggers.ts` |
| [x] | Register modules in `registry.ts` | `backend/src/services/agent/prompts/registry.ts` |
| [x] | Extend `transaction-approval.service.ts` for cross-chain notional (USD estimate via existing valuation) | [Backend] |

**Prompt content (lifi/swap.ts) must include**

- Use `cross_chain_quote` before `cross_chain_swap`
- Always pass `fromAddress` = agent wallet
- Poll `cross_chain_status` after broadcast; explain PENDING vs DONE vs FAILED
- Re-fetch quote after approval tx confirms (gas staleness)
- Rate limit: one quote per user intent when possible

### 1.6 Tests

| Status | Task |
| ------ | ---- |
| [x] | `tests/unit/defi/lifi/lifi-quote.service.test.ts` |
| [x] | `tests/unit/defi/lifi/lifi.errors.test.ts` |
| [x] | `tests/unit/defi/lifi/lifi-rate-limit.test.ts` |
| [x] | Integration test (mocked Li-Fi): quote → normalized output |

**Exit criteria:** Agent can quote ETH→Base USDC, bridge Base↔Arbitrum, and execute on staging; status tracked; errors are user-friendly; only `ENABLED_EVM_CHAIN_IDS` chains accepted.

---

## Phase 2 — Soroswap (`services/defi/soroswap/`)

> Stellar / Soroban swaps. Requires Phase 0 stellar adapter.

### 2.1 HTTP client

| Status | Task | Path |
| ------ | ---- | ---- |
| [ ] | Soroswap API client (Bearer auth, network query param) | `backend/src/services/defi/soroswap/soroswap.client.ts` |
| [ ] | Types + Zod schemas (quote, build, send, tokens, health) | `backend/src/services/defi/soroswap/soroswap.types.ts` |
| [ ] | `GET /health` — protocol availability guard | `backend/src/services/defi/soroswap/soroswap-health.service.ts` |

**Error handling**

| Status | Task | Path |
| ------ | ---- | ---- |
| [ ] | `soroswap.errors.ts` | `backend/src/services/defi/soroswap/soroswap.errors.ts` |
| [ ] | `SOROSWAP_UNAUTHORIZED` (401/403) — API key misconfigured | ↑ |
| [ ] | `SOROSWAP_ROUTE_NOT_FOUND` (400) | ↑ |
| [ ] | `SOROSWAP_UNAVAILABLE` (5xx / indexer down) | ↑ |
| [ ] | `SOROSWAP_VALIDATION_ERROR` | ↑ |

**Rate limiting**

| Status | Task | Path |
| ------ | ---- | ---- |
| [ ] | `soroswap-rate-limit.ts` — per-user + global buckets | `backend/src/services/defi/soroswap/soroswap-rate-limit.ts` |
| [ ] | Env: `SOROSWAP_RATE_LIMIT_CAPACITY`, `SOROSWAP_RATE_LIMIT_REFILL_MS` | `backend/src/config/soroswap.ts` |
| [ ] | Backoff on HTTP 429 (if returned) | `soroswap.client.ts` |

### 2.2 Token catalog

| Status | Task | Path |
| ------ | ---- | ---- |
| [ ] | `getSoroswapTokens(network)` — `/api/tokens` + asset lists | `backend/src/services/defi/soroswap/soroswap-token-catalog.service.ts` |
| [ ] | Resolve `XLM` / `USDC` code → contract address | `backend/src/services/defi/soroswap/soroswap-asset-resolve.ts` |
| [ ] | Cache 10 min; invalidate on network change | ↑ |

**Error handling:** unknown asset code → `TOKEN_NOT_FOUND` with hint to use contract address.

**Rate limiting:** catalog refresh max 1 / min per network (global).

### 2.3 Quote + build + execute

| Status | Task | Path |
| ------ | ---- | ---- |
| [ ] | `getSoroswapQuote(params)` — `POST /quote` | `backend/src/services/defi/soroswap/soroswap-quote.service.ts` |
| [ ] | `buildSoroswapTransaction(quoteId, ...)` — `POST /quote/build` | `backend/src/services/defi/soroswap/soroswap-build.service.ts` |
| [ ] | `executeSoroswapSwap(privyUserId, params)` — sign XDR + submit | `backend/src/services/defi/soroswap/soroswap-swap.service.ts` |
| [ ] | Optional: `gaslessTrustline` path + sponsor account config | `backend/src/services/defi/soroswap/soroswap-trustline.service.ts` |
| [ ] | Normalize to shared `SwapQuote` | `backend/src/services/defi/soroswap/soroswap-normalize.ts` |

**Error handling**

| Status | Task |
| ------ | ---- |
| [ ] | Simulation failure from build → surface Soroban error code in `details` |
| [ ] | Trustline missing (non-gasless) → actionable message |
| [ ] | `SLIPPAGE_EXCEEDED` when output < min |

**Rate limiting**

| Status | Task |
| ------ | ---- |
| [ ] | Quote: 30 / min per user; build+execute: 10 / min per user |
| [ ] | Quote cache 5 s per identical params |

### 2.4 Agent integration

| Status | Task | Path |
| ------ | ---- | ---- |
| [ ] | `query_chain`: `stellar_swap_quote`, `stellar_pools`, `stellar_token_price` | `query-chain.tool.ts` |
| [ ] | `execute_transaction`: `stellar_swap` (chain_id `stellar`) | `execute-transaction.tool.ts` |
| [ ] | `protocol:soroswap:env` | `backend/src/services/agent/prompts/protocols/soroswap/env.ts` |
| [ ] | `protocol:soroswap:swap` | `backend/src/services/agent/prompts/protocols/soroswap/swap.ts` |
| [ ] | Triggers — keywords: soroswap, stellar, soroban, XLM; chains: `stellar` | `module-triggers.ts` |
| [ ] | Wallet assets: Stellar balances via Soroswap `/balances` or Horizon | `wallet-assets.service.ts` |

**Prompt content (soroswap/swap.ts) must include**

- Amounts in stroops for API; display conversion for user
- `tradeType`: `EXACT_IN` default
- `protocols` from `/quote/protocols` health check
- Gasless trustline only when configured and user lacks trustline

### 2.5 Tests

| Status | Task |
| ------ | ---- |
| [ ] | `tests/unit/defi/soroswap/soroswap-quote.service.test.ts` |
| [ ] | `tests/unit/defi/soroswap/soroswap.errors.test.ts` |
| [ ] | Stellar signing integration test (mock Privy) |

**Exit criteria:** testnet swap XLM↔USDC via agent; trustline errors are clear.

---

## Phase 3 — SushiSwap (`services/defi/sushiswap/`)

> Same-chain EVM aggregator. Use when `fromChain === toChain` on EVM.

### 3.1 HTTP client

| Status | Task | Path |
| ------ | ---- | ---- |
| [ ] | Sushi API client — `Authorization` / API key header | `backend/src/services/defi/sushiswap/sushiswap.client.ts` |
| [ ] | Types for quote v7, swap v7, price v1, token v1 | `backend/src/services/defi/sushiswap/sushiswap.types.ts` |
| [ ] | Chain id validation against `getEvmNetworks()` | `backend/src/services/defi/sushiswap/sushiswap-chain-map.ts` |

**Error handling**

| Status | Task | Path |
| ------ | ---- | ---- |
| [ ] | `sushiswap.errors.ts` — map [API error types](https://docs.sushi.com/api/errors) | `backend/src/services/defi/sushiswap/sushiswap.errors.ts` |
| [ ] | `SUSHI_RATE_LIMITED` ← `ratelimit-exceeded` | ↑ |
| [ ] | `SUSHI_INVALID_API_KEY` ← `invalid-api-key` | ↑ |
| [ ] | `SUSHI_NO_FRESH_DATA` ← `no-fresh-data` | ↑ |
| [ ] | `SUSHI_VALIDATION` ← `validation` | ↑ |
| [ ] | `SUSHI_INSUFFICIENT_ALLOWANCE` / `SUSHI_INSUFFICIENT_BALANCE` | ↑ |

**Rate limiting**

| Status | Task | Path |
| ------ | ---- | ---- |
| [ ] | `sushiswap-rate-limit.ts` | `backend/src/services/defi/sushiswap/sushiswap-rate-limit.ts` |
| [ ] | Env: `SUSHI_RATE_LIMIT_CAPACITY`, `SUSHI_RATE_LIMIT_REFILL_MS` | `backend/src/config/sushiswap.ts` |
| [ ] | Respect Sushi 429; backoff + jitter | `sushiswap.client.ts` |

### 3.2 Quote + swap services

| Status | Task | Path |
| ------ | ---- | ---- |
| [ ] | `getSushiQuote(chainId, params)` — `/quote/v7/{chainId}` | `backend/src/services/defi/sushiswap/sushiswap-quote.service.ts` |
| [ ] | `getSushiSwapTx(chainId, params)` — `/swap/v7/{chainId}` | `backend/src/services/defi/sushiswap/sushiswap-swap.service.ts` |
| [ ] | `getSushiTokenPrice(chainId, tokens)` — pricing API | `backend/src/services/defi/sushiswap/sushiswap-price.service.ts` |
| [ ] | Token metadata helper | `backend/src/services/defi/sushiswap/sushiswap-token.service.ts` |
| [ ] | Normalize to `SwapQuote` | `backend/src/services/defi/sushiswap/sushiswap-normalize.ts` |

**Error handling**

| Status | Task |
| ------ | ---- |
| [ ] | `estimate-gas` failures → suggest smaller amount or higher slippage |
| [ ] | Token not on chain → `TOKEN_NOT_FOUND` |

**Rate limiting**

| Status | Task |
| ------ | ---- |
| [ ] | Quote: 60 / min per user (adjust per Sushi plan) |
| [ ] | Price batch: 20 / min global |

### 3.3 Execute + approval

| Status | Task | Path |
| ------ | ---- | ---- |
| [ ] | `executeSushiSwap(privyUserId, chainId, swapTx)` | `backend/src/services/defi/sushiswap/sushiswap-execute.service.ts` |
| [ ] | ERC-20 approval via viem (mirror Li-Fi approval pattern) | `backend/src/services/defi/sushiswap/sushiswap-approval.service.ts` |
| [ ] | `execute_transaction` action: `evm_swap` / `sushiswap_swap` | `evm.ts` adapter |
| [ ] | swap-registry: same-chain EVM → `evm-sushiswap` | `swap-registry.ts` |

**Error handling:** same as Li-Fi EVM execution patterns.

**Rate limiting:** execute 10 / hour per user default.

### 3.4 Agent integration

| Status | Task | Path |
| ------ | ---- | ---- |
| [ ] | `query_chain`: `evm_swap_quote`, `evm_token_price` | `query-chain.tool.ts` |
| [ ] | `protocol:sushiswap:env` | `backend/src/services/agent/prompts/protocols/sushiswap/env.ts` |
| [ ] | `protocol:sushiswap:swap` | `backend/src/services/agent/prompts/protocols/sushiswap/swap.ts` |
| [ ] | Triggers — swap on Base/Arbitrum, sushiswap, aggregator; chains: `ethereum` | `module-triggers.ts` |
| [ ] | Prompt: prefer Sushi for **same-chain** EVM; Li-Fi for **cross-chain** | `sushiswap/swap.ts` |

### 3.5 Tests

| Status | Task |
| ------ | ---- |
| [ ] | `tests/unit/defi/sushiswap/sushiswap-quote.service.test.ts` |
| [ ] | `tests/unit/defi/sushiswap/sushiswap.errors.test.ts` |
| [ ] | Router test: Base USDC→ETH uses Sushi not Li-Fi |

**Exit criteria:** Same-chain swap on configured EVM testnet/mainnet via agent.

---

## Phase 4 — Simple provider router

> Deterministic single-provider selection. **No multi-leg or cross-ecosystem routing** — that is Phase 8 (final).

| Status | Task | Path |
| ------ | ---- | ---- |
| [ ] | `selectSwapProvider({ chain_id, from_chain, to_chain, evm_chain_id })` | `backend/src/services/defi/provider-router.ts` |
| [ ] | Rules: `sui` → deepbook; `stellar` → soroswap; EVM same-chain → sushiswap; EVM cross-chain (enabled ids only) → lifi | ↑ |
| [ ] | Pre-flight: `CROSS_ECOSYSTEM_NOT_SUPPORTED` when stellar ↔ evm | ↑ |
| [ ] | Session route stickiness (don't switch provider mid-thread without reason) | `backend/src/services/agent/route-session.store.ts` |

**Error handling**

| Status | Task |
| ------ | ---- |
| [ ] | `AMBIGUOUS_PROVIDER` — user said "swap" without chain; trigger clarification (not regex guess) |
| [ ] | `DEFI_ROUTE_NOT_FOUND` — no provider for chain/capability combo |
| [ ] | Fallback: if Sushi no route on same-chain EVM, suggest Li-Fi same-chain (config flag `SUSHI_FALLBACK_TO_LIFI`) |

**Rate limiting**

| Status | Task |
| ------ | ---- |
| [ ] | Router itself is in-process — no outbound cost; provider calls use per-provider buckets |

**Exit criteria:** Router unit tests cover all v1 chain pairs; stellar→base returns `CROSS_ECOSYSTEM_NOT_SUPPORTED`.

---

## Phase 5 — Agent DeFi guardrails

> Tool-first verification, typo handling, and clarification. **Do not** add regex parsers for EVM/Stellar swap intents.

### 5.1 `token_resolve` query

| Status | Task | Path |
| ------ | ---- | ---- |
| [ ] | `query_chain` type: `token_resolve` — `{ chain_id, evm_chain_id?, symbol_or_address }` | `backend/src/services/agent/query-chain.tool.ts` |
| [ ] | Returns canonical symbol, address/code, decimals, `confidence: exact \| fuzzy \| none` | uses `supported-tokens.ts` + provider catalogs |
| [ ] | Fuzzy matches return `suggestions[]` — agent must clarify before execute | ↑ |
| [ ] | `query_chain` type: `supported_chains` — Radiant v1 allowlist + per-chain tokens | ↑ |

**Error handling:** `TOKEN_NOT_RECOGNIZED`, `TOKEN_AMBIGUOUS` with structured `suggestions`.

**Rate limiting:** 60 / min per user; cache 30 s.

### 5.2 Prompt module `core:defi-guardrails`

| Status | Task | Path |
| ------ | ---- | ---- |
| [ ] | Create `core:defi-guardrails` module | `backend/src/services/agent/prompts/core/defi-guardrails.ts` |
| [ ] | Register in `registry.ts`; inject when DeFi query/execute tools are relevant | `registry.ts`, `module-triggers.ts` |

**Prompt content must include**

- Call `token_resolve` before any swap or bridge — never trust raw user token strings
- If `confidence` is not `exact`, state your interpretation or trigger clarification ("Did you mean USDC?")
- Distinguish **token** from **chain**: "USDC on Base" requires `evm_chain_id: 8453`; "USDC on Stellar" is Soroswap
- If user omits chain on EVM, use session default or ask (Ethereum vs Arbitrum vs Base)
- If `CROSS_ECOSYSTEM_NOT_SUPPORTED`, explain what *is* possible (e.g. swap XLM→USDC on Stellar, or bridge USDC ETH→Base)
- Never call Soroswap when destination is an EVM chain; never call Sushi/Li-Fi for XLM
- Reuse workflow clarification for typos — do not silently map "shot" → USDC

### 5.3 Clarification integration

| Status | Task | Path |
| ------ | ---- | ---- |
| [ ] | Extend `workflow-clarification-gaps.ts` — token typo gap type (`token_clarification`) | `backend/src/services/agent/workflow/workflow-clarification-gaps.ts` |
| [ ] | Yes/No: "You wrote **{input}** — did you mean **{suggestion}**?" | ↑ |
| [ ] | Chain disambiguation gap when `TOKEN_AMBIGUOUS` (pick Ethereum / Arbitrum / Base) | ↑ |
| [ ] | Planner prompt: list token/chain assumptions in `assumptions[]` when inferring from typos | `planner-prompt.ts` |

**Error handling**

| Status | Task |
| ------ | ---- |
| [ ] | Clarification timeout / dismiss → do not execute; reply with what was understood |

**Rate limiting:** clarification rounds do not consume provider quote buckets.

### 5.4 Guardrail examples (acceptance tests)

| User input | Expected agent behavior |
| ---------- | ----------------------- |
| "swap 50 shot to eth" | `token_resolve("shot")` → clarify or suggest USDC |
| "swap 50 usda to usdc" | resolve both; clarify if usda unknown |
| "swap 50 XLM to USDC on base" | `CROSS_ECOSYSTEM_NOT_SUPPORTED` + explain options |
| "swap 100 usdc to eth" | clarify chain or use default; then Sushi quote |
| "bridge usdc to arb" | Li-Fi cross-chain quote (42161 in allowlist) |
| "swap on polygon" | `CHAIN_NOT_ENABLED` |

| Status | Task |
| ------ | ---- |
| [ ] | `tests/unit/agent/defi-guardrails.test.ts` — scenario table above | [Backend] |
| [ ] | `tests/unit/agent/token-resolve.test.ts` | [Backend] |

**Exit criteria:** Agent calls `token_resolve` before swaps; typos trigger clarification; cross-ecosystem requests fail fast with helpful copy.

---

## Phase 6 — Client and optional REST API

| Status | Task | Owner |
| ------ | ---- | ----- |
| [ ] | `GET /api/v1/defi/quote` — chain-agnostic quote proxy | [Backend] |
| [ ] | `GET /api/v1/defi/chains` — enabled chains + providers | [Backend] |
| [ ] | Rate limit defi routes (mirror `wallets/assets`) | [Backend] |
| [ ] | Chat UI: cross-chain progress indicator (Li-Fi status) | [Client] |
| [ ] | Settings: enable/disable providers per user (optional) | [Both] |
| [ ] | `api-ref.md` examples for new query types | [Backend] |

**Error handling:** REST routes use same `AppError` envelope; never expose provider API keys.

**Rate limiting:** `DEFI_QUOTE_RATE_LIMIT` — 20 / min per user on REST quote endpoint.

---

## Phase 7 — Security and ops

| Status | Task |
| ------ | ---- |
| [ ] | Read `.cursor/rules/security-api-guards.mdc` + `radiant-backend` SKILL § Security guards for outbound fetch |
| [ ] | Li-Fi / Sushi / Soroswap API keys server-only; never in client env |
| [ ] | Soroswap sponsor account keys (gasless trustline) in secrets manager |
| [ ] | Audit log: cross-chain swaps (privyUserId, route, amounts, tx hashes) |
| [ ] | Privy policies for EVM: restrict swap targets to known router addresses (optional) |
| [ ] | `npm run check` + new test suites in CI |

---

---

## Phase 8 — Cross-ecosystem route planner (final)

> **Implement last** — after Phases 0–7. Handles multi-leg routes the simple router cannot (e.g. XLM → USDC on Base). Agent uses tools + LLM reasoning; **no regex route parsing**.

### 8.1 Capability graph

| Status | Task | Path |
| ------ | ---- | ---- |
| [ ] | `backend/src/services/defi/capability-graph.ts` — edges: chain × provider × capability (swap, bridge) | [Backend] |
| [ ] | `isRouteFeasible(from, to)` — single-provider vs multi-leg vs impossible | ↑ |
| [ ] | Document graph in code comments + `docs/cross-chain-routing.md` (create when implementing) | [Docs] |

**v1 graph (no Stellar ↔ EVM edge until Phase 8)**

```text
sui        --[deepbook:swap]--> sui
stellar    --[soroswap:swap]--> stellar
ethereum:1 --[sushi:swap]--> ethereum:1
ethereum:42161 --[sushi:swap]--> ethereum:42161
ethereum:8453 --[sushi:swap]--> ethereum:8453
ethereum:{1,42161,8453} --[lifi:bridge]--> ethereum:{1,42161,8453}
stellar    --[???]--> ethereum:*   ← Phase 8 only (external bridge providers)
```

### 8.2 Route planner

| Status | Task | Path |
| ------ | ---- | ---- |
| [ ] | `planRoute({ from, to, amount })` → `RoutePlan` with ordered steps | `backend/src/services/defi/route-planner.ts` |
| [ ] | `query_chain` type: `route_quote` — read-only multi-leg comparison | `query-chain.tool.ts` |
| [ ] | Each step references provider id + quote params; agent executes steps sequentially | ↑ |
| [ ] | Prompt module `core:cross-venue-routing` | `backend/src/services/agent/prompts/core/cross-venue-routing.ts` |

**Error handling**

| Status | Task |
| ------ | ---- |
| [ ] | `ROUTE_NOT_SUPPORTED` — no path in capability graph |
| [ ] | `MULTI_LEG_REQUIRED` — feasible only as multi-step; return plan without executing |
| [ ] | Per-step failure → surface which leg failed; do not silently retry on wrong provider |

**Rate limiting**

| Status | Task |
| ------ | ---- |
| [ ] | `route_quote` costs 3 provider tokens (max 3 provider API calls per request) |
| [ ] | Multi-leg execute: each leg uses that provider's execute bucket |

### 8.3 Cross-ecosystem bridges (research + integrate)

| Status | Task |
| ------ | ---- |
| [ ] | Evaluate Stellar ↔ EVM bridges (Allbridge Core, Circle CCTP, Axelar) for v2 legs |
| [ ] | Feature flag `CROSS_ECOSYSTEM_ROUTING_ENABLED` — off until bridge integration tested |
| [ ] | Agent copy: present multi-leg plan with estimated time and per-step approvals |

**Exit criteria:** `route_quote` for ETH→Arbitrum→Base multi-hop (if needed) works; XLM→USDC@Base returns structured multi-leg plan or honest "not yet available" with `CROSS_ECOSYSTEM_ROUTING_ENABLED`.

---

## Phase L — Li-Fi Intents (deferred advanced)

> Only after Phase 1 aggregator is stable.

| Status | Task | Path |
| ------ | ---- | ---- |
| [ ] | Intents client (`https://order.li.fi`) | `backend/src/services/defi/lifi/intents/lifi-intents.client.ts` |
| [ ] | `POST /quote/request` + order submit flow | `lifi-intents-quote.service.ts` |
| [ ] | EIP-712 order signing via Privy EVM | `lifi-intents-sign.service.ts` |
| [ ] | Order status: Signed → Delivered → Settled | `lifi-intents-status.service.ts` |
| [ ] | Prompt module `protocol:lifi:intents` | `prompts/protocols/lifi/intents.ts` |
| [ ] | Feature flag `LIFI_INTENTS_ENABLED` | `config/lifi.ts` |

**Error handling:** intent-specific codes (`FILL_DEADLINE_EXCEEDED`, `ORDER_EXPIRED`, `REFUND_AVAILABLE`).

**Rate limiting:** Intents integrator API has no key/rate limit per docs — still apply Radiant per-user buckets to prevent abuse.

---

## Local environment setup (v1)

Copy `backend/.env.example` → `backend/.env` and `client/.env.example` → `client/.env.local`.

### Backend (`backend/.env`)

```bash
# Chain families — one Privy wallet per family
ENABLED_CHAINS=sui,ethereum,stellar
DEFAULT_AGENT_CHAIN=sui

# EVM: one 0x address on all listed networks
EVM_CHAIN_IDS=1,42161,8453
ENABLED_EVM_CHAIN_IDS=1,42161,8453
EVM_DEFAULT_CHAIN_ID=1
# Optional per-chain RPC:
# EVM_RPC_URL_1=
# EVM_RPC_URL_42161=
# EVM_RPC_URL_8453=

# Stellar
STELLAR_NETWORK=mainnet
HORIZON_URL=https://horizon.stellar.org
SOROBAN_RPC_URL=https://soroban-rpc.mainnet.stellar.org:443
PRIVY_STELLAR_POLICY_ID=

# Privy (required for wallet creation)
PRIVY_APP_ID=
PRIVY_APP_SECRET=
PRIVY_SIGNER_QUORUM_ID=
PRIVY_SUI_POLICY_ID=
PRIVY_EVM_POLICY_ID=
```

### Client (`client/.env.local`)

```bash
NEXT_PUBLIC_PRIVY_APP_ID=
NEXT_PUBLIC_API_URL=http://localhost:3001
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_PRIVY_SIGNER_QUORUM_ID=
NEXT_PUBLIC_PRIVY_SUI_POLICY_ID=
NEXT_PUBLIC_PRIVY_EVM_POLICY_ID=
NEXT_PUBLIC_PRIVY_STELLAR_POLICY_ID=

# Must mirror backend ENABLED_CHAINS
NEXT_PUBLIC_ENABLED_AGENT_CHAINS=sui,ethereum,stellar
NEXT_PUBLIC_DEFAULT_AGENT_CHAIN=sui

# Must mirror backend ENABLED_EVM_CHAIN_IDS
NEXT_PUBLIC_ENABLED_EVM_CHAIN_IDS=1,42161,8453
NEXT_PUBLIC_EVM_DEFAULT_CHAIN_ID=1
```

### Privy Dashboard

1. **Embedded wallets** — enable **Sui**, **Ethereum**, **Stellar** (extended chains).
2. **Policies** — create optional policies; copy IDs to `PRIVY_*_POLICY_ID` / `NEXT_PUBLIC_PRIVY_*_POLICY_ID`.
3. **createOnLogin** — leave off; Radiant provisions wallets after login and when the user opens Settings → Agent wallet.

### What gets provisioned

| Env chain family | Privy method | Address | Networks |
| ---------------- | ------------ | ------- | -------- |
| `sui` | `extended-chains` `chainType: "sui"` | Sui address | Sui mainnet |
| `ethereum` | `useCreateWallet()` (EVM) | One `0x` | Ethereum (1), Arbitrum (42161), Base (8453) |
| `stellar` | `extended-chains` `chainType: "stellar"` | `G…` | Stellar mainnet |

Token allowlists (Phase 0.5) are separate — env above only controls **which chains get wallets**.

---

## Environment variables (summary)

| Variable | Provider | Purpose |
| -------- | -------- | ------- |
| `LIFI_API_BASE_URL` | Li-Fi | Default `https://li.quest/v1` |
| `LIFI_API_KEY` | Li-Fi | Production rate limits |
| `LIFI_RATE_LIMIT_CAPACITY` | Li-Fi | Outbound bucket |
| `LIFI_RATE_LIMIT_REFILL_MS` | Li-Fi | Bucket refill |
| `LIFI_DEFAULT_SLIPPAGE` | Li-Fi | e.g. `0.005` |
| `LIFI_INTEGRATOR_FEE` | Li-Fi | Integrator fee fraction (default `0.001` = 0.1%) |
| `LIFI_INTENTS_ENABLED` | Li-Fi | Phase L flag |
| `SOROSWAP_API_BASE_URL` | Soroswap | API base |
| `SOROSWAP_API_KEY` | Soroswap | Bearer token |
| `SOROSWAP_NETWORK` | Soroswap | `mainnet` \| `testnet` |
| `SOROSWAP_RATE_LIMIT_*` | Soroswap | Outbound bucket |
| `SOROSWAP_SPONSOR_SECRET` | Soroswap | Gasless trustline (optional) |
| `SUSHI_API_BASE_URL` | Sushi | API base |
| `SUSHI_API_KEY` | Sushi | Required for prod |
| `SUSHI_RATE_LIMIT_*` | Sushi | Outbound bucket |
| `STELLAR_NETWORK` | Stellar | `testnet` \| `mainnet` |
| `HORIZON_URL` | Stellar | Horizon RPC |
| `SOROBAN_RPC_URL` | Stellar | Soroban RPC |
| `ENABLED_EVM_CHAIN_IDS` | Radiant | `1,42161,8453` — Ethereum, Arbitrum, Base |
| `CROSS_ECOSYSTEM_ROUTING_ENABLED` | Route planner | Phase 8 feature flag (default `false`) |
| `SUSHI_FALLBACK_TO_LIFI` | Provider router | Phase 4 — same-chain fallback |
| `DEFI_CATALOG_CACHE_TTL_SECONDS` | DeFi cache | Phase 0.6 — default 600 |
| `DEFI_QUOTE_CACHE_TTL_SECONDS` | DeFi cache | Phase 0.6 — default 10 |
| `DEFI_QUOTE_DEDUPE_TTL_SECONDS` | DeFi cache | Phase 0.6 — default 5 |
| `DEFI_BALANCE_CACHE_TTL_SECONDS` | DeFi cache | Phase 0.6 — RPC balance reads |
| `DEFI_TOKEN_RESOLVE_CACHE_TTL_SECONDS` | DeFi cache | Phase 0.6 — default 30 |

---

## Dependency graph

```text
Phase 0 (allowlist + stellar adapter + defi registry + cache layer)
    ├── Phase 2 (Soroswap)
    ├── Phase 3 (SushiSwap) ──┐
    └── Phase 1 (Li-Fi) ──────┼── Phase 4 (simple provider router)
                              │
                              ├── Phase 5 (agent guardrails)
                              │
                              ├── Phase 6 (client / REST)
                              │
                              └── Phase 7 (security)
                                        │
                                        └── Phase 8 (cross-ecosystem planner) ← FINAL
                                                  │
                                                  └── Phase L (Li-Fi Intents)
```

**Recommended order:** Phase 0 → Phase 3 (Sushi) → Phase 1 (Li-Fi) → Phase 2 (Soroswap) → Phase 4 → Phase 5 → Phase 6 → Phase 7 → **Phase 8**.

---

## Link from main TODO

Add to [backend/docs/TODO.md](../backend/docs/TODO.md):

```markdown
## Phase 13 — Multi-provider DeFi (Li-Fi, Soroswap, SushiSwap)

> Full checklist: [docs/defi-providers-integration-TODO.md](../../docs/defi-providers-integration-TODO.md)

| Status | Task | Owner |
| ------ | ---- | ----- |
| [ ] | Phase 0 — Allowlist + Stellar adapter + defi registry | [Backend] |
| [x] | Phase 1 — Li-Fi (Sui/Solana ↔ EVM + EVM ↔ EVM) | [Backend] |
| [ ] | Phase 2 — Soroswap (Stellar) | [Backend] |
| [ ] | Phase 3 — SushiSwap (EVM same-chain) | [Backend] |
| [ ] | Phase 4 — Simple provider router | [Backend] |
| [ ] | Phase 5 — Agent DeFi guardrails | [Backend] |
| [ ] | Phase 6 — Client / REST | [Both] |
| [ ] | Phase 7 — Security and ops | [Backend] |
| [ ] | Phase 8 — Cross-ecosystem route planner (**final**) | [Backend] |
| [ ] | Phase L — Li-Fi Intents (deferred) | [Backend] |
```

---

## Quick reference: file tree to create

```text
backend/src/
  config/
    lifi.ts
    soroswap.ts
    sushiswap.ts
    stellar.ts
    supported-tokens.ts
  infrastructure/
    stellar/
      client.ts
      rpc-retry.ts
  services/
    defi/
      types.ts                    # shared (move from deepbook/types.ts)
      provider-router.ts
      capability-graph.ts         # Phase 8
      route-planner.ts            # Phase 8
      rate-limit.ts
      cache.ts                    # Phase 0.6 — namespaced cachedFetch
      lifi/
        lifi.client.ts
        lifi.types.ts
        lifi.errors.ts
        lifi-rate-limit.ts
        lifi-chain-map.ts
        lifi-chains.service.ts
        lifi-token-catalog.service.ts
        lifi-connections.service.ts
        lifi-tools.service.ts
        lifi-quote.service.ts
        lifi-routes.service.ts
        lifi-normalize.ts
        lifi-approval.service.ts
        lifi-execute.service.ts
        lifi-status.service.ts
      soroswap/
        soroswap.client.ts
        soroswap.types.ts
        soroswap.errors.ts
        soroswap-rate-limit.ts
        soroswap-health.service.ts
        soroswap-token-catalog.service.ts
        soroswap-asset-resolve.ts
        soroswap-quote.service.ts
        soroswap-build.service.ts
        soroswap-swap.service.ts
        soroswap-trustline.service.ts
        soroswap-normalize.ts
      sushiswap/
        sushiswap.client.ts
        sushiswap.types.ts
        sushiswap.errors.ts
        sushiswap-rate-limit.ts
        sushiswap-chain-map.ts
        sushiswap-quote.service.ts
        sushiswap-swap.service.ts
        sushiswap-price.service.ts
        sushiswap-token.service.ts
        sushiswap-normalize.ts
        sushiswap-approval.service.ts
        sushiswap-execute.service.ts
    chains/adapters/stellar.ts
    wallet/stellar-signing.service.ts
    wallet/stellar-transaction.service.ts
    agent/prompts/
      core/
        defi-guardrails.ts        # Phase 5
        cross-venue-routing.ts    # Phase 8
      protocols/
      lifi/{env,swap,bridge}.ts
      soroswap/{env,swap}.ts
      sushiswap/{env,swap}.ts
```
