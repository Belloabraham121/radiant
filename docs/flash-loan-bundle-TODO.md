# Flash loan bundle — implementation TODO

Multi-step atomic flash loans (`borrow → swap(s) → repay`) plus separate flash-loan auto-approve (no SUI notional cap).

**Builds on:** Phase F in [deepbook-v3-TODO.md](./deepbook-v3-TODO.md) (`round_trip`, `allow_flash_loans`, approval UI).

**Principle:** One `execute_transaction` action (`deepbook_flash_loan`), one PTB. Agent picks a **whitelisted strategy** + **structured steps**; backend composes borrow, swaps, repay. Flash-loan auto-approve is **separate** from swap/transfer `auto_approve_max_sui`.

**References**

- [DeepBook flash loans SDK](https://docs.sui.io/onchain-finance/deepbookv3-sdk/flash-loans)
- `backend/src/services/defi/deepbook-flash-loan.service.ts` (round_trip today)
- `backend/src/services/defi/deepbook-swap.service.ts` (swap quote + `swapExactQuantity` pattern)

---

## Product behavior

| Scenario | Expected behavior |
| -------- | ----------------- |
| User enables **Allow flash loans** only | Agent may call flash loan tools; **every** execute shows approval dialog |
| User also enables **Auto-approve flash loans** | `swap_chain_repay` with repay-from-swap-output may execute without dialog; **no SUI borrow cap** |
| User asks “flash borrow 10 SUI, swap to USDC, swap back, repay” | Agent calls `flash_loan_quote` → `deepbook_flash_loan` with `strategy: swap_chain_repay` + `steps[]` |
| Repay would use wallet coins (`repay_from: wallet`) | **Always** requires approval (even if auto-approve flash is on) |
| Quote says `repay_feasible: false` | Agent explains; must not execute |
| Flash loans disabled | `403 FLASH_LOANS_DISABLED` before quote or execute |

---

## Architecture

```text
Agent
  query_chain.flash_loan_quote  ──► validate + per-step quotes + repay feasibility
  execute_transaction.deepbook_flash_loan
        │
        ▼
deepbook-flash-loan.service.ts        (orchestration, execute, preflight)
deepbook-flash-loan.types.ts          (strategies, steps, bundle params)
deepbook-flash-loan-bundle.ts         (PTB composer: coin ledger)
deepbook-flash-loan-quote.ts          (multi-step quote)
        │
        ├─ flashLoans.borrowBase/Quote
        ├─ deepBook.swapExactQuantity (per step, pass coin objects)
        ├─ tx.mergeCoins (repay coin assembly)
        ├─ flashLoans.returnBase/Quote
        └─ tx.transferObjects (surplus → user)
```

---

## Phase 1 — Types & strategy registry

### 1.1 `deepbook-flash-loan.types.ts`

| Status | Task | Implementation detail |
| ------ | ---- | --------------------- |
| [ ] | Create types module | New file `backend/src/services/defi/deepbook-flash-loan.types.ts` |
| [ ] | `FlashLoanStrategy` enum | `"round_trip" \| "swap_chain_repay"` (v1); reserve `"swap_repay"` alias if single-step is just `steps.length === 1` |
| [ ] | `FlashLoanStep` type | `{ pool_key: string; side: "buy" \| "sell"; amount: number; pay_with_deep?: boolean; min_out_display?: number }` |
| [ ] | `FlashLoanRepaySource` | `"swap_output" \| "wallet" \| "merged"` — default `swap_output` for `swap_chain_repay` |
| [ ] | `DeepBookFlashLoanBundleParams` | Extends current params: `pool_key`, `borrow_amount`, `asset`/`coin_key`, `strategy`, `steps?`, `slippage_bps?`, `repay_source?`, `estimated_surplus?` |
| [ ] | `FlashLoanStepQuote` | Per-step: `pool_key`, `side`, `in_amount`, `out_est`, `min_out`, `fee_deep`, `input_coin`, `output_coin` |
| [ ] | `FlashLoanBundleQuoteResult` | `strategy`, borrow fields, `steps: FlashLoanStepQuote[]`, `repay_asset`, `repay_amount`, `repay_feasible`, `repay_source`, `estimated_surplus`, `warnings: string[]` |
| [ ] | Constants | `MAX_FLASH_LOAN_STEPS = 2` (v1), `DEFAULT_FLASH_LOAN_SLIPPAGE_BPS = 100` |

### 1.2 Parser

| Status | Task | Implementation detail |
| ------ | ---- | --------------------- |
| [ ] | `parseDeepBookFlashLoanParams` | Move/extend in `deepbook-flash-loan.service.ts` or re-export from types module |
| [ ] | `round_trip` parsing | Keep current behavior: no `steps` required |
| [ ] | `swap_chain_repay` parsing | Require `steps` array, length 1–`MAX_FLASH_LOAN_STEPS`; each step must have `pool_key`, `side`, positive `amount` |
| [ ] | Default `slippage_bps` | 100 if omitted |
| [ ] | Default `repay_source` | `swap_output` for `swap_chain_repay` |
| [ ] | Reject unknown `strategy` | `VALIDATION_ERROR` with list of supported strategies |
| [ ] | Reject `steps` on `round_trip` | Or ignore extra keys — prefer strict validation |

---

## Phase 2 — Validation rules

### 2.1 `validateFlashLoanBundle()` in `deepbook-flash-loan-bundle.ts`

| Status | Task | Implementation detail |
| ------ | ---- | --------------------- |
| [ ] | Permission gate | Call `assertFlashLoansEnabled(privyUserId)` |
| [ ] | Pool existence | Reuse `assertPoolKey` for borrow pool and each step `pool_key` |
| [ ] | Borrow lot/min (base) | Reuse `validateFlashLoanSize` / `isMultipleOfStep` for base borrows |
| [ ] | Step lot/min | For each step spending **base** of that pool, validate against that pool's `lot_size` / `min_size` via `getDeepBookPoolInfo` |
| [ ] | **Same-pool borrow+trade guard** | If `asset === "base"` and any step's `pool_key === borrow pool_key`, throw `VALIDATION_ERROR` with DeepBook doc message (borrow + trade same pool can fail) |
| [ ] | **Repay asset closure** | For `repay_source: swap_output`, assert last step `output_coin === borrow coin_key` (e.g. borrow SUI → final step must output SUI) |
| [ ] | Step amount chain | Step 1 `amount` should equal `borrow_amount` when input is borrowed asset; step 2 `amount` should match step 1 quoted output (tolerance or require agent pass `min_out` from quote) |
| [ ] | Wallet repay guard | If `repay_source` is `wallet` or `merged`, mark `requires_manual_approval: true` on quote result |
| [ ] | Max borrow notional (optional safety) | Env `AGENT_FLASH_LOAN_MAX_BORROW_SUI` — not tied to auto-approve threshold; hard ceiling only |

---

## Phase 3 — Quote (`query_chain` → `flash_loan_quote`)

### 3.1 Service `deepbook-flash-loan-quote.ts`

| Status | Task | Implementation detail |
| ------ | ---- | --------------------- |
| [ ] | `getFlashLoanBundleQuote(privyUserId, params)` | Entry: parse → validate → quote steps → assemble result |
| [ ] | Step 0 quote | Borrow pool info only (no swap quote for borrow itself) |
| [ ] | Per-step swap quote | Reuse `getDeepBookSwapQuote` / SDK with same `side` + `amount`; compute `min_out` via `applySlippage` from swap service |
| [ ] | Coin continuity | Track `input_coin` / `output_coin` per step; verify step N+1 input coin === step N output coin |
| [ ] | `repay_feasible` | `last_step.min_out >= borrow_amount` (with small epsilon) when `repay_source: swap_output` |
| [ ] | `estimated_surplus` | `last_step.out_est - borrow_amount` when feasible |
| [ ] | `warnings[]` | Same-pool risk, low surplus, high slippage, DEEP fee needed from wallet |
| [ ] | `round_trip` quote | Return borrow metadata only; `repay_feasible: true` |

### 3.2 `query-chain.tool.ts`

| Status | Task | Implementation detail |
| ------ | ---- | --------------------- |
| [ ] | Add `flash_loan_quote` to enum | `queryChainInputSchema` + tool `input_schema` description |
| [ ] | Handler case | `case "flash_loan_quote": return getFlashLoanBundleQuote(...)` |
| [ ] | Sui-only | `assertSuiDeepBookQuery` |
| [ ] | Params passthrough | Same shape as `deepbook_flash_loan` execute params |

### 3.3 `agent.types.ts`

| Status | Task | Implementation detail |
| ------ | ---- | --------------------- |
| [ ] | Extend `query` enum | Add `flash_loan_quote` |
| [ ] | Extend `QueryChainResult` | Union `FlashLoanBundleQuoteResult` |

---

## Phase 4 — PTB composer (`swap_chain_repay`)

### 4.1 `deepbook-flash-loan-bundle.ts`

| Status | Task | Implementation detail |
| ------ | ---- | --------------------- |
| [ ] | `buildSwapChainRepayPtb(tx, client, address, parsed, quotes)` | Main composer |
| [ ] | Borrow | `tx.add(flashLoans.borrowBaseAsset \| borrowQuoteAsset)` → `[borrowedCoin, flashLoan]` |
| [ ] | Coin ledger variable | `let coinIn = borrowedCoin`; optional `deepCoin` from wallet if fees need it |
| [ ] | Loop steps | For each step `i`: call `tx.add(deepBook.swapExactQuantity({ poolKey, amount, minOut, isBaseToCoin, baseCoin/quoteCoin/deepCoin: coin objects }))` — pass `coinIn` as the appropriate input coin arg per SDK (see `deepbook.ts` `swapExactQuantity`) |
| [ ] | Step output selection | After swap: set `coinIn` to output coin for next step; `transferObjects` unused outputs (other leg, DEEP dust) to `address` or hold in merge bucket |
| [ ] | Repay coin | For `swap_output`: use final `coinIn`; `tx.splitCoins` if amount > repay; optional `tx.mergeCoins` if fragments |
| [ ] | Return | `tx.add(flashLoans.returnBaseAsset \| returnQuoteAsset(pool, borrow_amount, repayCoin, flashLoan))` |
| [ ] | Surplus | `tx.transferObjects([remainder, ...profitCoins], address)` |
| [ ] | `round_trip` builder | Keep existing `addFlashLoanRoundTripToTransaction` (refactor into bundle module) |
| [ ] | Strategy dispatch | `buildFlashLoanPtb(parsed, quotes)` switches on `strategy` |

### 4.2 Integrate into `deepbook-flash-loan.service.ts`

| Status | Task | Implementation detail |
| ------ | ---- | --------------------- |
| [ ] | `buildDeepBookFlashLoanTransactionBytes` | Parse → validate → quote (or accept pre-quoted `min_out_display` on steps) → `buildFlashLoanPtb` → `tx.build()` |
| [ ] | `preflightDeepBookFlashLoan` | Unchanged entry; must succeed for bundle strategies |
| [ ] | `executeDeepBookFlashLoan` | Same path + sign + broadcast |
| [ ] | Result shape | Extend `DeepBookFlashLoanTxResult` with `strategy`, `steps_count`, `estimated_surplus` |

### 4.3 SDK coin wiring (critical)

| Status | Task | Implementation detail |
| ------ | ---- | --------------------- |
| [ ] | Document coin args per side | `sell` (base→quote): pass `borrowedCoin` as `baseCoin` in `swapExactQuantity`; `buy` (quote→base): pass accumulated quote coin as `quoteCoin` |
| [ ] | `pay_with_deep` | If true, pass wallet DEEP or borrowed DEEP coin object; validate wallet DEEP balance in quote |
| [ ] | Do not use wallet input coin for step 1 | Step 1 input must be borrowed coin only for `swap_chain_repay` |
| [ ] | Integration test | `tx.build({ client })` dry-run on testnet/mainnet read-only — no sign; assert no build errors for a known-small bundle |

---

## Phase 5 — Flash-loan auto-approve (separate from SUI cap)

### 5.1 Schema & permissions

| Status | Task | Implementation detail |
| ------ | ---- | --------------------- |
| [ ] | Prisma migration | `User.agent_auto_approve_flash_loans Boolean @default(false)` |
| [ ] | `AgentPermissions` type | Add `auto_approve_flash_loans: boolean` |
| [ ] | `updateAgentPermissionsSchema` | Add optional `auto_approve_flash_loans` |
| [ ] | `agentPermissionsFromUser` | Map column; default `false` |
| [ ] | `updateAgentPermissions` | Patch column |
| [ ] | `GET/PATCH /api/v1/agent/permissions` | Automatically includes new field via service |
| [ ] | `GET /api/v1/auth/me` | `agent_permissions` includes new field |

### 5.2 Approval logic `transaction-approval.service.ts`

| Status | Task | Implementation detail |
| ------ | ---- | --------------------- |
| [ ] | Replace hardcoded always-approve | Remove block that always returns `true` for flash loans |
| [ ] | Add `flashLoanRequiresApproval(permissions, input)` | If `!allow_flash_loans` → throw (or handle at execute); if `repay_source` is `wallet` or `merged` → **always** `true`; else return `!auto_approve_flash_loans` |
| [ ] | **Never** call `resolveAutoApproveMaxDisplay` for flash loans | No borrow amount vs SUI threshold |
| [ ] | Wire into `transferRequiresApprovalWithPermissions` | Call `flashLoanRequiresApproval` when `isDeepBookFlashLoanAction` |
| [ ] | Unit tests | Cases: allow off; allow on + auto off → approve; allow on + auto on + swap_output → skip; wallet repay → always approve |

### 5.3 Client Settings

| Status | Task | Implementation detail |
| ------ | ---- | --------------------- |
| [ ] | `AgentPermissions` type | Add `auto_approve_flash_loans` |
| [ ] | `useAgentPermissions` | `setAutoApproveFlashLoans`; merge defaults on load |
| [ ] | `AgentPermissionsSection` | Second toggle under “Allow flash loans”, disabled when allow is off |
| [ ] | Copy | “Execute flash loans without a confirmation dialog. Atomic loans only spend gas if the transaction fails. Swaps that repay from your wallet still ask for approval.” |

---

## Phase 6 — Agent contract & prompts

### 6.1 `execute-transaction.tool.ts`

| Status | Task | Implementation detail |
| ------ | ---- | --------------------- |
| [ ] | Update `action` description | Document `strategy: swap_chain_repay` and `steps[]` |
| [ ] | Update `params` description | Full JSON shape with example 2-hop SUI route |

### 6.2 `prompts.ts`

| Status | Task | Implementation detail |
| ------ | ---- | --------------------- |
| [ ] | Remove “always require approval” | Replace with auto-approve flash rules |
| [ ] | Multi-step flow | “For flash loan with swaps: call `query_chain flash_loan_quote` first, then `execute_transaction deepbook_flash_loan` with same params and step `min_out_display` values from quote.” |
| [ ] | Workflow guard | “Never use workflow sequential swaps for flash loans — one bundled `deepbook_flash_loan` only.” |
| [ ] | Permission lines | `flashLoanLine` + `autoApproveFlashLine` from permissions |
| [ ] | Failure handling | If `repay_feasible: false`, explain; do not execute |

### 6.3 `unsupported-capabilities.ts`

| Status | Task | Implementation detail |
| ------ | ---- | --------------------- |
| [ ] | Update `SUPPORTED_DEEPBOOK_SUMMARY` | Mention multi-step flash loans + quote |

---

## Phase 7 — Display, activity, approval UI

### 7.1 `build-display.ts`

| Status | Task | Implementation detail |
| ------ | ---- | --------------------- |
| [ ] | Multi-step title | `Flash loan bundle (SUI_USDC)` |
| [ ] | Multi-step `amount_display` | `Borrow 10 SUI → sell @ POOL_A → buy @ POOL_B → repay 10 SUI` |
| [ ] | `enrichDisplayFromResult` | Include surplus if present |

### 7.2 `TransactionApprovalBar.tsx`

| Status | Task | Implementation detail |
| ------ | ---- | --------------------- |
| [ ] | Detect `swap_chain_repay` | Parse `pending.params.strategy` and `steps` |
| [ ] | Route summary | List each step with side, pool, amount |
| [ ] | Repay line | “Repay {borrow_amount} {coin} atomically” |
| [ ] | Warning | Keep atomic revert warning; add “estimated surplus” if in params |

### 7.3 `categorize-action.ts`

| Status | Task | Implementation detail |
| ------ | ---- | --------------------- |
| [ ] | Optional | Add `flash_loan` to `AgentTransactionCategory` enum + migration, or keep `other` |

---

## Phase 8 — Testing

| Status | Area | Tests |
| ------ | ---- | ----- |
| [ ] | Unit | `parseDeepBookFlashLoanParams` for `swap_chain_repay` with 2 steps |
| [ ] | Unit | Validation: same-pool borrow+trade rejected |
| [ ] | Unit | Validation: last step output coin must match borrow asset |
| [ ] | Unit | `flashLoanRequiresApproval` matrix (allow, auto, repay_source) |
| [ ] | Unit | Quote: `repay_feasible` true/false from mocked step outputs |
| [ ] | Unit | `flash_loan_quote` schema in `query-chain` tests |
| [ ] | Integration | `buildDeepBookFlashLoanTransactionBytes` dry-run build for `swap_chain_repay` (no sign) |
| [ ] | Integration | PATCH permissions with `auto_approve_flash_loans` |
| [ ] | Agent | Stub: quote → execute path; auto-approve skips pending |

---

## Phase 9 — Docs & cross-links

| Status | Task |
| ------ | ---- |
| [ ] | Update `docs/deepbook-v3-TODO.md` Phase F — add “Phase F2 → flash-loan-bundle-TODO.md” |
| [ ] | Update `backend/api-ref.md` — `flash_loan_quote`, extended `deepbook_flash_loan` params, `auto_approve_flash_loans` |
| [ ] | Update `backend/docs/TODO.md` — link new doc |

---

## Suggested implementation order

```text
1 Types + parser + validation
2 flash_loan_quote (read path)
3 PTB composer swap_chain_repay (2 steps)
4 Wire execute + preflight + adapter result
5 auto_approve_flash_loans permission + approval logic
6 Agent prompts + execute tool schema
7 Client settings + approval bar
8 Tests + docs
```

---

## Example agent payloads (target)

### Quote + execute (`swap_chain_repay`)

```json
{
  "chain_id": "sui",
  "query": "flash_loan_quote",
  "params": {
    "pool_key": "SUI_USDC",
    "borrow_amount": 5,
    "asset": "base",
    "strategy": "swap_chain_repay",
    "slippage_bps": 100,
    "steps": [
      { "pool_key": "DEEP_USDC", "side": "sell", "amount": 5 },
      { "pool_key": "SUI_USDC", "side": "buy", "amount": 6.4 }
    ]
  }
}
```

```json
{
  "chain_id": "sui",
  "action": "deepbook_flash_loan",
  "params": {
    "pool_key": "SUI_USDC",
    "borrow_amount": 5,
    "asset": "base",
    "strategy": "swap_chain_repay",
    "steps": [
      { "pool_key": "DEEP_USDC", "side": "sell", "amount": 5, "min_out_display": 6.35 },
      { "pool_key": "SUI_USDC", "side": "buy", "amount": 6.4, "min_out_display": 5.01 }
    ]
  }
}
```

---

## Open decisions

| # | Question | Recommendation |
| - | -------- | -------------- |
| 1 | Max steps v1 | **2** — borrow hop + repay hop |
| 2 | Single-step `swap_repay` name | Use `swap_chain_repay` with `steps.length === 1` |
| 3 | Auto-approve + `round_trip` | Allow skip dialog if `auto_approve_flash_loans` (gas-only) |
| 4 | Borrow cap | Optional env max, **not** user SUI threshold |
| 5 | `repay_from: wallet` in v1 | Defer or allow with forced approval |

---

*Last updated: 2026-06-13*
