# DeepBook Margin SDK — implementation TODO

Leveraged trading on Sui via **DeepBook Margin** (`@mysten/deepbook-v3` margin modules). Tracks gaps between the official SDK surface and Radiant's agent tools (`query_chain`, `execute_transaction`).

**References**

- [DeepBook Margin overview](https://docs.sui.io/onchain-finance/deepbook-margin/)
- [DeepBook Margin SDK index](https://docs.sui.io/onchain-finance/deepbook-margin-sdk/)
- [Margin Manager SDK](https://docs.sui.io/onchain-finance/deepbook-margin-sdk/margin-manager)
- [Margin Pool SDK](https://docs.sui.io/onchain-finance/deepbook-margin-sdk/margin-pool)
- [Orders SDK](https://docs.sui.io/onchain-finance/deepbook-margin-sdk/orders)
- [Maintainer SDK](https://docs.sui.io/onchain-finance/deepbook-margin-sdk/maintainer)
- [Take Profit / Stop Loss SDK](https://docs.sui.io/onchain-finance/deepbook-margin-sdk/tpsl)
- [DeepBook Margin Indexer](https://docs.sui.io/onchain-finance/deepbook-margin/deepbook-margin-indexer)
- Related: [deepbook-v3-TODO.md](./deepbook-v3-TODO.md)

**Principle:** Agent tools stay chain-agnostic. Margin logic lives under `backend/src/services/defi/deepbook/` and is invoked by the Sui adapter + `query_chain` / `execute_transaction` enums.

**Network:** Mainnet first (`DEEPBOOK_ENV=mainnet`). Margin-enabled pool keys come from SDK `mainnetMarginPools` / `testnetMarginPools` via `getMarginEnabledPoolKeys()`.

---

## Product behavior

| Scenario                                          | Expected behavior                                                                                     | Status                  |
| ------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | ----------------------- |
| User asks to create a margin manager              | Agent lists margin-enabled pools → user picks pool → `deepbook_provision_margin_manager { pool_key }` | Done                    |
| User asks "what's my margin manager address?"     | `query_chain margin_manager_info` → address + `margin_manager_key: "default"`                         | Done                    |
| User deposits collateral / borrows / repays       | `deepbook_margin_deposit`, `_borrow`, `_repay`, `_withdraw`                                           | Done                    |
| User places leveraged limit or market order       | `deepbook_margin_place_limit_order`, `_place_market_order`                                            | Done                    |
| User cancels or modifies a margin order           | `deepbook_margin_cancel_order`, `_modify_order`                                                       | Done                    |
| User asks risk ratio, balances, debt              | `margin_manager_info` returns live `managerState` from SDK                                            | Done                    |
| User asks margin pool utilization / interest rate | `margin_pool_info` returns live on-chain metrics                                                      | Done                    |
| User sets take-profit / stop-loss                 | TPSL conditional order actions + query                                                                | Done                    |
| User supplies liquidity to margin pool            | SupplierCap mint + supply / withdraw                                                                  | **Done** |
| Protocol maintainer configures pools              | Maintainer actions gated by env + capability                                                          | **Not done**            |

---

## Already implemented

Check off when verified in production; all items below exist in code today.

### Margin Manager — write

| Status | SDK function                                    | Radiant surface                                             | Code                                                      |
| ------ | ----------------------------------------------- | ----------------------------------------------------------- | --------------------------------------------------------- |
| [x]    | `newMarginManager`                              | `execute_transaction` → `deepbook_provision_margin_manager` | `deepbook-margin-execution.service.ts`                    |
| [x]    | `depositBase`, `depositQuote`, `depositDeep`    | `deepbook_margin_deposit`                                   | `deepbook-margin-execution.service.ts`                    |
| [x]    | `withdrawBase`, `withdrawQuote`, `withdrawDeep` | `deepbook_margin_withdraw`                                  | `deepbook-margin-execution.service.ts`                    |
| [x]    | `borrowBase`, `borrowQuote`                     | `deepbook_margin_borrow`                                    | `deepbook-margin-execution.service.ts`                    |
| [x]    | `repayBase`, `repayQuote`                       | `deepbook_margin_repay`                                     | `deepbook-margin-execution.service.ts`                    |
| [x]    | On-chain address lookup                         | `query_chain` → `margin_manager_info` (address/key only)    | `margin-manager-lookup.service.ts`, `query-chain.tool.ts` |
| [x]    | Live manager state (SDK reads)                  | `query_chain` → `margin_manager_info` + `live_state`        | `deepbook-margin-read.service.ts`                         |

### Orders — write

| Status | SDK function       | Radiant surface                      | Code                                   |
| ------ | ------------------ | ------------------------------------ | -------------------------------------- |
| [x]    | `placeLimitOrder`  | `deepbook_margin_place_limit_order`  | `deepbook-margin-execution.service.ts` |
| [x]    | `placeMarketOrder` | `deepbook_margin_place_market_order` | `deepbook-margin-execution.service.ts` |
| [x]    | `modifyOrder`      | `deepbook_margin_modify_order`       | `deepbook-margin-execution.service.ts` |
| [x]    | `cancelOrder`      | `deepbook_margin_cancel_order`       | `deepbook-margin-execution.service.ts` |

### Margin Pool — partial

| Status | SDK function                       | Radiant surface                                  | Code                                         |
| ------ | ---------------------------------- | ------------------------------------------------ | -------------------------------------------- |
| [x]    | Static pool list + leverage config | `query_chain` → `margin_pool_info` (config only) | `query-chain.tool.ts`, `MARGIN_POOL_CONFIGS` |
| [x]    | Live pool metrics                  | `query_chain` → `margin_pool_info` + `live_state` | `deepbook-margin-pool-read.service.ts`      |
| [x]    | `supplyToMarginPool`               | `deepbook_margin_supply_pool`                    | SupplierCap auto-mint on first supply        |
| [x]    | `withdrawFromMarginPool`           | `deepbook_margin_withdraw_pool`                  | Uses stored/on-chain SupplierCap             |

### Agent plumbing (existing margin actions)

| Status | Task                                                               |
| ------ | ------------------------------------------------------------------ | --------------------------------- |
| [x]    | `execute-transaction.tool.ts` action list + param docs             |
| [x]    | `app-action-registry.ts` + `app-action-param-schemas.ts`           |
| [x]    | `classify-execute-action.ts` margin / order categories             |
| [x]    | Agent prompts (`prompts.ts`) — provision, deposit, borrow flow     |
| [x]    | `summarize-query-chain.ts` — `margin_manager_info` live state summary |
| [x]    | `margin-approval-flow.ts` deposit/borrow nudges                    |
| [x]    | Unit tests for action classification                               | `deepbook-margin-predict.test.ts` |

---

## Phase 1 — Trader essentials (highest impact)

### 1.1 Margin Manager — read-only state

Wire SDK read functions into `query_chain margin_manager_info` ([Margin Manager SDK — read-only](https://docs.sui.io/onchain-finance/deepbook-margin-sdk/margin-manager)).

| Status | Task                                                       | Implementation detail                                                  |
| ------ | ---------------------------------------------------------- | ---------------------------------------------------------------------- |
| [x]    | Create `deepbook-margin-read.service.ts`                   | Build `DeepBookClient` with `marginManagers` map; call SDK read APIs   |
| [x]    | `managerState`                                             | Return risk ratio, assets, debts, Pyth price snapshot                  |
| [x]    | `baseBalance`, `quoteBalance`, `deepBalance`               | Individual collateral balances                                         |
| [x]    | `borrowedBaseShares`, `borrowedQuoteShares`, `hasBaseDebt` | Debt side                                                              |
| [x]    | `owner`, `deepbookPool`, `marginPoolId`                    | Metadata                                                               |
| [x]    | Extend `margin_manager_info` response                      | Merge lookup + live state; keep `margin_manager_key: "default"`        |
| [x]    | Update `summarize-query-chain.ts`                          | Human-readable risk ratio + balances for the model                     |
| [x]    | Fix tool description in `query-chain.tool.ts`              | Description already promises balances/risk — align with implementation |
| [x]    | Unit tests                                                 | Mock SDK read responses                                                |

### 1.2 Margin Pool — read-only state

Wire SDK read functions into `query_chain margin_pool_info` ([Margin Pool SDK — read-only](https://docs.sui.io/onchain-finance/deepbook-margin-sdk/margin-pool)).

| Status | Task                                          | Implementation detail                                                        |
| ------ | --------------------------------------------- | ---------------------------------------------------------------------------- |
| [x]    | Create `deepbook-margin-pool-read.service.ts` | `totalSupply`, `totalBorrow`, `interestRate`, utilization                    |
| [x]    | Extend `margin_pool_info`                     | Live metrics + existing static config                                        |
| [x]    | Optional: user supplier position              | `userSupplyShares`, `userSupplyAmount` when `supplier_cap_id` param provided |
| [x]    | Update `summarize-query-chain.ts`             | Format pool metrics for agent                                                |
| [x]    | Unit tests                                    |                                                                              |

### 1.3 Take Profit / Stop Loss — full module

([TPSL SDK](https://docs.sui.io/onchain-finance/deepbook-margin-sdk/tpsl))

| Status | Task                          | SDK function                                          | Radiant action (proposed)                     |
| ------ | ----------------------------- | ----------------------------------------------------- | --------------------------------------------- |
| [x]    | Add conditional order         | `addConditionalOrder`                                 | `deepbook_margin_tpsl_add`                    |
| [x]    | Cancel one                    | `cancelConditionalOrder`                              | `deepbook_margin_tpsl_cancel`                 |
| [x]    | Cancel all                    | `cancelAllConditionalOrders`                          | `deepbook_margin_tpsl_cancel_all`             |
| [x]    | Execute triggered (keeper)    | `executeConditionalOrders`                            | `deepbook_margin_tpsl_execute`                |
| [x]    | Query order IDs               | `conditionalOrderIds`                                 | `query_chain margin_tpsl_info`                |
| [x]    | Query single order            | `conditionalOrder`                                    | param `conditional_order_id` (filters IDs)    |
| [x]    | Query trigger bounds          | `lowestTriggerAbovePrice`, `highestTriggerBelowPrice` | include in `margin_tpsl_info`                 |
| [x]    | Execution service             | `deepbook-margin-tpsl.service.ts`                     | Use `client.marginTPSL.*`                     |
| [x]    | Types                         | `deepbook-margin-tpsl.types.ts`                       | Pending limit/market order params             |
| [x]    | Agent prompts                 | Explain TP (trigger above) vs SL (trigger below)      |
| [x]    | App action registry + schemas | `margin_tpsl_add`, `_cancel`, `_cancel_all`           |
| [x]    | Unit + integration tests      |                                                       |

---

## Phase 2 — Trading completeness

### 2.1 Orders — additional write actions

([Orders SDK](https://docs.sui.io/onchain-finance/deepbook-margin-sdk/orders))

| Status | Task                                          | SDK function                      | Radiant action (proposed)                         |
| ------ | --------------------------------------------- | --------------------------------- | ------------------------------------------------- |
| [x]    | Reduce-only limit                             | `placeReduceOnlyLimitOrder`       | `deepbook_margin_place_reduce_only_limit_order`   |
| [x]    | Reduce-only market                            | `placeReduceOnlyMarketOrder`      | `deepbook_margin_place_reduce_only_market_order`  |
| [x]    | Batch cancel                                  | `cancelOrders`                    | `deepbook_margin_cancel_orders`                   |
| [x]    | Cancel all                                    | `cancelAllOrders`                 | `deepbook_margin_cancel_all_orders`               |
| [x]    | Withdraw settled                              | `withdrawSettledAmounts`          | `deepbook_margin_withdraw_settled`                |
| [x]    | Permissionless settled withdraw               | `withdrawMarginSettledAmounts`    | `deepbook_margin_withdraw_settled_permissionless` |
| [x]    | Update Pyth price                             | `updateCurrentPrice`              | `deepbook_margin_update_price`                    |
| [x]    | Extend `deepbook-margin-execution.service.ts` | Add switch cases + PTB builders   |
| [x]    | Preflight + validation                        | Pool key, manager key, order IDs  |
| [x]    | Agent + app-action plumbing                   | Schemas, prompts, display strings |

### 2.2 Orders — read

| Status | Task                           | Implementation detail                                                                                                             |
| ------ | ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------- |
| [x]    | Margin open orders query       | New `query_chain` type e.g. `margin_open_orders` (do not reuse balance-manager `deepbook_open_orders`)                            |
| [x]    | Indexer integration (optional) | [DeepBook Margin Indexer](https://docs.sui.io/onchain-finance/deepbook-margin/deepbook-margin-indexer) for history / liquidations |

### 2.3 Orders — stake, governance, rebates

| Status | Task                          | SDK function     | Radiant action (proposed)         |
| ------ | ----------------------------- | ---------------- | --------------------------------- |
| [x]    | Stake DEEP via margin manager | `stake`          | `deepbook_margin_stake`           |
| [x]    | Unstake DEEP                  | `unstake`        | `deepbook_margin_unstake`         |
| [x]    | Submit fee proposal           | `submitProposal` | `deepbook_margin_submit_proposal` |
| [x]    | Vote on proposal              | `vote`           | `deepbook_margin_vote`            |
| [x]    | Claim trading rebate          | `claimRebate`    | `deepbook_margin_claim_rebate`    |

---

## Phase 3 — Margin Manager extras

([Margin Manager SDK](https://docs.sui.io/onchain-finance/deepbook-margin-sdk/margin-manager))

| Status | Task                                   | SDK function                                                                             | Radiant action (proposed)                                                          |
| ------ | -------------------------------------- | ---------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| [x]    | Liquidate undercollateralized position | `liquidate`                                                                              | `deepbook_margin_liquidate`                                                        |
| [x]    | Set pool referral                      | `setMarginManagerReferral`                                                               | `deepbook_margin_set_referral`                                                     |
| [x]    | Unset pool referral                    | `unsetMarginManagerReferral`                                                             | `deepbook_margin_unset_referral`                                                   |
| [x]    | Atomic create + initial deposit        | `newMarginManagerWithInitializer` + `depositDuringInitialization` + `shareMarginManager` | extend `deepbook_provision_margin_manager` with optional `coin_type` + `amount` |

---

## Phase 4 — Margin Pool LP & referrals

([Margin Pool SDK](https://docs.sui.io/onchain-finance/deepbook-margin-sdk/margin-pool))

| Status | Task                                | SDK function                                        | Notes                                                        |
| ------ | ----------------------------------- | --------------------------------------------------- | ------------------------------------------------------------ |
| [x]    | Mint SupplierCap                    | `mintSupplierCap`                                   | Auto-minted on first `deepbook_margin_supply_pool`           |
| [x]    | Supply to pool                      | `supplyToMarginPool`                                | `executeMarginSupplyPool` + SupplierCap persistence          |
| [x]    | Withdraw from pool                  | `withdrawFromMarginPool`                            | `executeMarginWithdrawPool`                                  |
| [x]    | Mint supply referral                | `mintSupplyReferral`                                | `deepbook_margin_mint_supply_referral`                       |
| [x]    | Withdraw referral fees              | `withdrawReferralFees`                              | `deepbook_margin_withdraw_referral_fees`                     |
| [x]    | SupplierCap storage                 | New table or `AgentWallet` JSON column              | `DeepBookMarginSupplierCap` + `DeepBookMarginSupplyReferral` |
| [x]    | Preflight                           | Verify SupplierCap ownership before supply/withdraw | `requireSupplierCapForWithdraw` / supply auto-mint           |
| [x]    | Remove `MARGIN_SUPPLY_NOT_LIVE` 501 | After SupplierCap flow is live                      |

---

## Phase 5 — Maintainer (admin only)

([Maintainer SDK](https://docs.sui.io/onchain-finance/deepbook-margin-sdk/maintainer))

**Not for normal agent users.** Gate behind env (`DEEPBOOK_MARGIN_MAINTAINER_ENABLED`) and maintainer capability object IDs. Consider a separate admin API rather than `execute_transaction` unless explicitly needed.

| Status | Task                                    | SDK function                                                    |
| ------ | --------------------------------------- | --------------------------------------------------------------- |
| [x]    | Create margin pool                      | `createMarginPool`                                              |
| [x]    | Protocol config builders                | `newProtocolConfig`, `newMarginPoolConfig`, `newInterestConfig` |
| [x]    | Enable / disable pool for loans         | `enableDeepbookPoolForLoan`, `disableDeepbookPoolForLoan`       |
| [x]    | Update interest params                  | `updateInterestParams`                                          |
| [x]    | Update pool config                      | `updateMarginPoolConfig`                                        |
| [x]    | Withdraw maintainer fees                | `withdrawMaintainerFees` (direct moveCall)                      |
| [x]    | Withdraw protocol fees                  | `withdrawProtocolFees` (direct moveCall)                        |
| [x]    | Admin withdraw default referral fees    | `adminWithdrawDefaultReferralFees`                              |
| [x]    | `deepbook-margin-maintainer.service.ts` | Isolated from user-facing execution                             |
| [x]    | Capability validation                   | Fail closed without maintainer cap                              |

---

## Phase 6 — Cross-cutting (every phase)

| Status | Task                                                     | Files                                                |
| ------ | -------------------------------------------------------- | ---------------------------------------------------- |
| [x]    | `execute-transaction.tool.ts`                            | New action names + param docs                        |
| [x]    | `classify-execute-action.ts`                             | Ledger categories for new actions                    |
| [x]    | `app-action-registry.ts` + `app-action-param-schemas.ts` | App builder handlers                                 |
| [x]    | `build-display.ts`                                       | Approval card copy                                   |
| [x]    | `summarize-query-chain.ts`                               | Post-execute and query summaries                     |
| [x]    | `prompts.ts`                                             | Agent guidance per new capability                    |
| [x]    | `transaction-error-context.ts`                           | User-friendly error hints                            |
| [x]    | `sui.ts` adapter                                         | Route new actions to execution services              |
| [x]    | `radiant-agent-runtime-template.ts`                      | Client SDK helpers for generated apps                |
| [x]    | Unit tests                                               | Extend `deepbook-margin-predict.test.ts`             |
| [x]    | `validate-execute-transaction.ts`                        | Zod / validation for new params                      |
| [x]    | `summarize-tool-result.ts`                               | Margin maintainer / referral execute summaries       |
| [x]    | `radiant-client-template.ts`                             | REST helpers wired to live margin read routes        |
| [x]    | Update [deepbook-v3-TODO.md](./deepbook-v3-TODO.md)      | Margin removed from "out of scope" list |

---

## Suggested implementation order

1. **Phase 1.1** — Live `margin_manager_info` (risk ratio unlocks safe borrow UX)
2. **Phase 1.2** — Live `margin_pool_info`
3. **Phase 1.3** — TPSL (high user demand for position management)
4. **Phase 2.1** — Reduce-only + cancel-all + settled withdraw
5. **Phase 2.2** — Margin open orders query
6. **Phase 4** — Margin pool LP (SupplierCap)
7. **Phase 3** — Liquidation + referrals
8. **Phase 2.3** — Stake / governance / rebates via margin manager
9. **Phase 5** — Maintainer (only if Radiant operates protocol caps)
10. **Phase 7.2 + 7.6** — Margin UI param/`data-radiant-id` alignment (quick win for pinned apps)
11. **Phase 7.1 + 7.4 + 7.7** — Full margin app plug-and-play (schema detection + REST + reference app)

---

## File map (target)

```text
backend/src/services/defi/deepbook/
├── deepbook-margin-execution.service.ts   # existing — extend with new writes
├── deepbook-margin-read.service.ts        # NEW — managerState, balances, debt
├── deepbook-margin-pool-read.service.ts   # NEW — pool metrics
├── deepbook-margin-tpsl.service.ts        # NEW — conditional orders
├── deepbook-margin-maintainer.service.ts  # NEW — admin only
├── deepbook-margin.types.ts               # extend
├── deepbook-margin-tpsl.types.ts          # NEW
├── margin-manager-lookup.service.ts       # existing
├── deepbook-margin-indexer-read.service.ts # NEW — indexer query_chain wrappers
├── indexer/deepbook-margin-indexer.client.ts # NEW — margin indexer HTTP client
└── deepbook-margin-orders.service.ts      # existing — extend param builders

backend/src/services/agent/
├── query-chain.tool.ts                    # margin_manager_info, margin_pool_info, margin_tpsl_info, margin_open_orders
└── execute-transaction.tool.ts            # new action enum entries
```

---

## Progress summary

| SDK module     | Write actions | Read queries | Overall     |
| -------------- | ------------- | ------------ | ----------- |
| Margin Manager | ~70%          | ~10%         | Partial     |
| Margin Pool    | ~0% (stubs)   | ~20%         | Minimal     |
| Orders         | ~40%          | 0%           | Partial     |
| TPSL           | 0%            | 0%           | Not started |
| Maintainer     | 100% (gated)  | 0%           | Admin only  |
| **App / UI**   | ~60% registry | ~0% REST     | Partial     |

_Last updated: 2026-06-16 — sourced from Sui docs + Radiant codebase audit._

---

## Phase 7 — Generated app / UI (plug-and-play with existing action schema)

Goal: when you ask the agent to **build a margin trading UI** (`generate_app`) or **drive an existing app** (`call_app_action` on a pinned preview), margin flows must work **without breaking** the existing app-action pipeline. This section is derived from **code**, not docs.

### How the plug-in works today (do not bypass)

```text
generate_app artifact
  → inferProjectActionSchemaForArtifact()     app-action-schema.service.ts
  → project.action_schema persisted           generate-app.service.ts
  → query_chain project_actions | session_actions
  → call_app_action { action, params }        call-app-action.tool.ts
  → assertActionInProjectSchema()             action must be in catalog
  → deepBookAppAdapter.execute()              deepbook-app.adapter.ts
  → validateAppActionInput()                  app-action-mapper.ts
  → mapAppActionToExecuteInput()              app action name → execute_action
  → runExecuteTransactionToolWithApproval()

Generated app iframe
  → lib/radiant-agent-runtime.ts              radiant-agent-runtime-template.ts
  → window.__radiantAgent.register(action)   handler drives UI
  → ctx.executeAction(action, params)         radiant-client-template.ts → POST .../actions/:action
  → genericFallbackHandler                    maps param keys → data-radiant-id
```

**Rule:** App action names (`margin_deposit`, …) are the **public contract**. They map to `deepbook_margin_*` via `APP_ACTION_REGISTRY` — never call `execute_transaction` from a pinned app (see `pinned-app-scope.types.ts`).

### Already wired for margin apps

| Status | Layer | What exists |
| ------ | ----- | ----------- |
| [x] | `ONCHAIN_ACTION_NAMES` | 10 margin actions in `app-action.types.ts` |
| [x] | `APP_ACTION_REGISTRY` | Each maps to `deepbook_margin_*` in `app-action-registry.ts` |
| [x] | Zod + field docs | `app-action-param-schemas.ts` (validation + `appActionParamSchemaDocs`) |
| [x] | Protocol adapter | `deepbook-app.adapter.ts` — all deepbook registry actions |
| [x] | Agent runtime | Margin names in `ONCHAIN_ACTIONS` set (`radiant-agent-runtime-template.ts`) |
| [x] | Generic UI driver | `genericFallbackHandler` fills `data-radiant-id` from param keys |
| [x] | Agent chat prompts | Margin `data-radiant-id` hints in `prompts.ts` (needs alignment — see 7.2) |
| [x] | Client template stubs | `marginManagerInfo`, `marginPoolInfo`, `marginRiskRatio` in `radiant-client-template.ts` |

### Gaps blocking plug-and-play margin UIs

| Status | Gap | Evidence in code |
| ------ | --- | ---------------- |
| [x] | **Action schema not inferred** for margin apps | `EXECUTE_MARGIN_PATTERNS`, `DEFAULT_MARGIN_TEMPLATE_ACTIONS`, `template: "margin"`, manifest/register onchain detection |
| [x] | **No `margin_provision_manager` app action** | `margin_provision_manager` → `deepbook_provision_margin_manager` in registry |
| [x] | **REST read routes missing** for generated apps | `GET .../deepbook/margin-*` on project, session, installation scopes |
| [x] | **`data-radiant-id` ≠ schema param names** | `MARGIN_RADIANT_ID_GUIDE` in `prompts.ts` aligns generated apps with schema param keys |
| [x] | **No margin param coercion** | `normalizeMarginAppActionParams` in `app-action-param-coerce.ts` |
| [x] | **No dedicated margin agent handlers** | Platform `defaultMarginAgentHandler` in `radiant-agent-runtime-template.ts` v7 |
| [x] | **No reference margin app artifact** | `template: "margin"` injects reference MarginTradingApp via `margin-app-reference.template.ts` |
| [ ] | **New SDK actions won't appear in apps** until registry chain updated | Same 6-file pattern as Phase 6 |

---

### 7.1 Action schema detection (generate_app → project_actions)

Extend `app-action-schema.service.ts` so margin UIs get the correct catalog **automatically** when saved.

| Status | Task | Implementation detail |
| ------ | ---- | --------------------- |
| [x] | Add `EXECUTE_MARGIN_PATTERNS` | Mirror `EXECUTE_HELPER_PATTERNS`: e.g. `executeAction('margin_deposit')`, … |
| [x] | Add component heuristics | e.g. `MarginApp`, `MarginTrading`, `marginManagerInfo`, `margin-order` in artifact source |
| [x] | Add `DEFAULT_MARGIN_TEMPLATE_ACTIONS` constant | Includes deposit/borrow/orders/TPSL/supply actions |
| [x] | Optional `template: "margin"` in generate_app | When set, persist full `DEFAULT_MARGIN_TEMPLATE_ACTIONS` |
| [x] | Support `lib/radiant-actions.ts` manifest | On-chain names in manifest are detected for schema inference |
| [x] | Unit tests | `tests/unit/app-action-schema.test.ts` — margin artifact detects actions |

**Do not** change `ProjectActionSchema` shape (`schema_version: 2`) — extend detection only.

---

### 7.2 Canonical `data-radiant-id` ↔ param mapping

`genericFallbackHandler` (`radiant-agent-runtime-template.ts`) resolves elements by:

1. `data-radiant-id="{param_name}"` (snake_case), or
2. `data-radiant-id="{param-kebab}"` (underscores → hyphens)

**Generated apps MUST use ids that match `appActionParamSchemaDocs` field names** (or kebab equivalent). Update agent prompts to match — replace informal ids like `collateral-amount`.

| App action | Schema param (`app-action-param-schemas.ts`) | Required `data-radiant-id` on input |
| ---------- | --------------------------------------------- | ----------------------------------- |
| `margin_deposit` | `margin_manager_key`, `coin_type`, `amount` | `margin-manager-key`, `coin-type`, `amount` |
| `margin_borrow` | `margin_manager_key`, `asset`, `amount` | `margin-manager-key`, `asset`, `amount` |
| `margin_repay` | `margin_manager_key`, `asset`, `amount?` | same |
| `margin_place_limit_order` | `pool_key`, `margin_manager_key`, `price`, `quantity`, `is_bid`, `pay_with_deep?` | `pool-key`, `margin-manager-key`, `price`, `quantity`, `is-bid`, `pay-with-deep` |
| `margin_place_market_order` | `pool_key`, `margin_manager_key`, `quantity`, `is_bid` | `pool-key`, `margin-manager-key`, `quantity`, `is-bid` |
| `margin_cancel_order` | `margin_manager_key`, `order_id` | `margin-manager-key`, `order-id` |

| Status | Task |
| ------ | ---- |
| [x] | Add `MARGIN_RADIANT_ID_GUIDE` constant in `prompts.ts` — table above, not ad-hoc ids |
| [x] | Hidden field pattern: `<input type="hidden" data-radiant-id="margin-manager-key" value="default" />` on every margin form |
| [x] | Submit buttons: `data-radiant-id="margin-deposit-submit"`, `margin-borrow-submit`, … (generic fallback also matches `*[data-radiant-id*="submit"]`) |
| [x] | Display-only elements (no param key): `data-radiant-id="risk-ratio-display"` — update via React + `ctx.dispatchEvent`, not generic fallback |

---

### 7.3 Agent runtime handlers (optional but recommended)

Generic fallback works for simple forms; margin flows benefit from **registered handlers** (same pattern as `defaultSwapAgentHandler`).

| Status | Task | Implementation detail |
| ------ | ---- | --------------------- |
| [ ] | `defaultMarginDepositHandler` | set `amount`, `coin_type`, `margin_manager_key` → highlight submit → `ctx.executeAction("margin_deposit", params)` |
| [ ] | `defaultMarginBorrowHandler` | same for borrow |
| [ ] | `defaultMarginOrderHandler` | shared for limit/market; set price/quantity/is_bid |
| [ ] | Register in template | `handlers.set("margin_deposit", …)` etc. in `radiant-agent-runtime-template.ts` |
| [ ] | Bump `RADIANT_AGENT_RUNTIME_VERSION` | When handlers ship (generated apps embed version) |

Handlers must call **`ctx.executeAction` with canonical app action names** (`margin_deposit`), not `deepbook_margin_deposit`.

---

### 7.4 REST read API for generated apps (match swap pattern)

`radiant-client-template.ts` already exports margin helpers pointing at routes that **do not exist**. Mirror existing DeepBook project routes:

| Status | Route (per scope) | Handler | Backing service |
| ------ | ----------------- | ------- | --------------- |
| [x] | `GET .../deepbook/margin-manager-info` | project + session + installation | Phase 1.1 read service |
| [x] | `GET .../deepbook/margin-pool-info?pool_key=` | project + session + installation | Phase 1.2 read service |
| [x] | `GET .../deepbook/margin-risk-ratio` | optional alias of manager state | same as manager-info |
| [x] | `GET .../deepbook/margin-open-orders?pool_key=` | when Phase 2.2 ships | margin orders read |

Copy the **project / session / installation triplet** from `projects.ts` + `sessions.ts` + `installations.ts` (see `pool-info`, `open-orders` handlers). Use shared service functions like existing `poolInfoForProject`.

| Status | Task |
| ------ | ---- |
| [x] | `deepbook-margin-app-read.service.ts` — thin wrapper calling query_chain-equivalent logic for HTTP |
| [x] | Wire auth via `requireAuth` + project/session ownership (same as swap quote) |

---

### 7.5 `margin_provision_manager` app action

Provisioning today bypasses the app pipeline (`execute_transaction` only). For UIs with a "Create margin account" button:

| Status | Task | Files |
| ------ | ---- | ----- |
| [x] | Add `margin_provision_manager` to `ONCHAIN_ACTION_NAMES` | `app-action.types.ts` |
| [x] | Registry entry → `deepbook_provision_margin_manager` | `app-action-registry.ts` |
| [x] | Zod: `{ pool_key: string }` (+ optional `coin_type`, `amount`) | `app-action-param-schemas.ts` |
| [x] | Field docs: `pool_key` required | `appActionParamSchemaDocs` |
| [x] | `validate-execute-transaction.ts` | already supports action |
| [x] | UI: `data-radiant-id="pool-key"` + `margin-provision-submit` | prompts |
| [x] | Default handler or generic fallback | `radiant-agent-runtime-template.ts` |

---

### 7.6 Param coercion & defaults (agent + UI friendly)

| Status | Task | File |
| ------ | ---- | ---- |
| [x] | Coerce `amount`, `price`, `quantity`, `new_quantity` for all `margin_*` actions | `app-action-param-coerce.ts` |
| [x] | Default `margin_manager_key: "default"` when omitted | `normalizeMarginAppActionParams` |
| [x] | Coerce `is_bid` from `"buy"` / `"sell"` strings | `coerceIsBid` helper |

---

### 7.7 Reference margin app (generate_app seed)

| Status | Task |
| ------ | ---- |
| [x] | Add minimal `MarginTradingApp` component in agent generate_app examples / system prompt | `margin-app-reference.template.ts` + `prompts.ts` |
| [x] | Include: pool picker, provision CTA, deposit/borrow forms, order form, risk ratio panel | reference component |
| [x] | `lib/radiant-actions.ts` manifest listing all margin actions + param fields | injected with template margin |
| [x] | Register handlers for each action on mount | `lib/margin-agent-handlers.ts` |
| [x] | Use `marginManagerInfo()` / `marginPoolInfo()` from radiant-client for display state | reference component |
| [x] | E2B scaffold smoke: agent can `call_app_action margin_deposit` on draft | integration test in `generate-app.test.ts` |

---

### 7.8 Plug-in checklist for **each new** margin SDK action (Phases 1–5)

When adding any new backend margin capability, append to the app pipeline in **this order** (same as existing margin actions — do not invent a parallel path):

| Step | File | Change |
| ---- | ---- | ------ |
| 1 | `execute-transaction.tool.ts` | Document `deepbook_margin_*` action + params |
| 2 | `validate-execute-transaction.ts` | Validation rules |
| 3 | `deepbook-margin-execution.service.ts` | PTB execution |
| 4 | `ONCHAIN_ACTION_NAMES` | Add `margin_*` canonical name |
| 5 | `app-action-registry.ts` | `defineAction({ execute_action: "deepbook_margin_*" })` |
| 6 | `app-action-param-schemas.ts` | Zod schema + `appActionParamSchemaDocs` fields |
| 7 | `radiant-agent-runtime-template.ts` | Add to `ONCHAIN_ACTIONS` set; optional handler |
| 8 | `app-action-schema.service.ts` | Detection pattern + `DEFAULT_MARGIN_TEMPLATE_ACTIONS` |
| 9 | `prompts.ts` | `data-radiant-id` row in margin guide |
| 10 | `build-display.ts` | Approval card label |
| 11 | `radiant-client-template.ts` | Optional read helper + REST route if UI needs data |
| 12 | Tests | `deepbook-margin-predict.test.ts` + app-action schema test |

**Pinned app rule unchanged:** new actions are available to the agent only after they appear in the app's `action_schema` (via detection, manifest, or explicit template list).

---

### 7.9 Suggested order (UI track)

1. **7.2 + 7.6** — Align prompts + coercion (fixes agent-driven UI without backend changes)
2. **7.1 + 7.5** — Schema detection + provision app action
3. **7.4** — REST read routes (unblocks live dashboards in generated apps)
4. **7.3 + 7.7** — Handlers + reference margin app
5. **7.8** — Apply checklist as Phases 1–5 SDK actions land (TPSL, reduce-only, etc.)

---

### Phase 7 file map

```text
backend/src/services/projects/
├── app-action-schema.service.ts      # 7.1 detection + DEFAULT_MARGIN_TEMPLATE_ACTIONS
├── app-action-param-schemas.ts       # 7.5 provision + new action schemas
├── app-action-param-coerce.ts        # 7.6 margin coercion
├── radiant-agent-runtime-template.ts # 7.3 handlers, ONCHAIN_ACTIONS
└── radiant-client-template.ts        # 7.4 client helpers (routes must exist)

backend/src/api/routes/v1/
├── projects/projects.ts              # 7.4 margin GET routes
├── chat/sessions.ts                  # 7.4 session-scoped routes
└── installations/installations.ts    # 7.4 installation-scoped routes

backend/src/services/agent/runtime/
└── prompts.ts                        # 7.2 MARGIN_RADIANT_ID_GUIDE
```
