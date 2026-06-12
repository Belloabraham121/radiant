# DeepBook chat test playbook

Use this document to manually test everything Radiant has implemented for **DeepBook V3** through the **agent chat**. For each test, paste the suggested question into chat, then fill in **Response** and **Error**.

**Covers (implemented today):**

| Phase | Feature                                              |
| ----- | ---------------------------------------------------- |
| **B** | Balance manager — info, balances, deposit, withdraw  |
| **C** | Pools — list, pool info, ticker, indexer reads       |
| **D** | Swaps — quote, execute, approval, receipts           |
| —     | Wallet context, approval UX, friendly error handling |

**Not in chat yet** (optional negative tests at the end): open orders, limit orders, stake, governance, flash loans.

---

## How to use

1. Log in with your **agent wallet** (Sui).
2. Note your **Settings → Agent permissions** (auto-approve on/off, SUI threshold).
3. Work top to bottom, or jump to a section.
4. For each test: copy **Ask the agent** → send → record **Response** and **Error**.
5. Mark **Pass?** when behavior matches **Expected**.

### Test session

| Field                       | Value |
| --------------------------- | ----- |
| Date                        |       |
| Tester                      |       |
| Network (mainnet / testnet) |       |
| Auto-approve enabled?       |       |
| Auto-approve max SUI        |       |
| Agent wallet has SUI?       |       |
| Agent wallet has USDC?      |       |

### Receipt chips (what you may see under agent messages)

| Receipt label          | Meaning                                             |
| ---------------------- | --------------------------------------------------- |
| Balance checked        | Wallet native balance query                         |
| DeepBook manager       | Manager not provisioned, or status                  |
| DeepBook balances      | Coins held in balance manager                       |
| Swap quote             | Read-only quote (no tx sent)                        |
| Swap approval required | Execute paused — approval bar should show           |
| Swap executed          | Swap broadcast successfully                         |
| DeepBook transfer      | Deposit or withdraw succeeded                       |
| Transaction failed     | Tool error — agent should explain in plain language |
| Query failed           | Read query failed                                   |

### Approval bar (inline above chat input)

- Appears for swaps when approval is required (settings / amount threshold).
- **Always** appears for `deepbook_deposit` and `deepbook_withdraw`.
- Click **Approve** to broadcast; **Cancel** to dismiss.

---

## 0 — Prerequisites & wallet context

### 0-01 — Agent wallet balance

**Ask the agent:**

> What is my Sui agent wallet balance?

**Expected:** `query_chain` → `balance` or `native_balance`. Reply includes SUI amount. Receipt: **Balance checked**.

**Pass?** Yes

**Response:**

```


```

**Error:**

```


```

---

### 0-02 — Full wallet holdings

**Ask the agent:**

> Show all tokens in my agent wallet on Sui.

**Expected:** `query_chain` → `token_balances`. Lists SUI, USDC, DEEP, etc. if held.

**Pass?** Yes

**Response:**

```


```

**Error:**

```


```

---

## B — Balance manager (Phase B)

### B-01 — Manager status (read-only, no provisioning)

**Ask the agent:**

> Do I have a DeepBook balance manager set up?

**Expected:** `query_chain` → `deepbook_manager_info`. Says provisioned or not. Receipt: **DeepBook manager** if not provisioned.

**Pass?** Yes

**Response:**

```
You do not have a DeepBook balance manager set up in your wallet. If you would like assistance with setting one up or have any other questions, just let me know!

```

**Error:**

```


```

---

### B-02 — All manager balances

**Ask the agent:**

> What are my DeepBook balance manager balances?

**Expected:** `query_chain` → `deepbook_manager_balance`. May **auto-provision** manager on first use (on-chain tx + gas). Lists SUI, USDC, DEEP, etc. in manager.

**Pass?** ☐ Yes ☐ No

**Response:**

```


```

**Error:**

```


```

---

### B-03 — Single coin balance in manager

**Ask the agent:**

> How much SUI is in my DeepBook balance manager?

**Expected:** `deepbook_manager_balance` with coin filter. Returns SUI balance in manager (may be 0).

**Pass?** ☐ Yes ☐ No

**Response:**

```


```

**Error:**

```


```

---

### B-03b — Set up balance manager (provision)

**Ask the agent:**

> Can you set up my DeepBook balance manager?

**Expected:** `execute_transaction` → `deepbook_provision_manager` (not deposit). Approval bar: **Approve setup** · `Network fee only (~0.01 SUI)`. No token deposit.

**Pass?** ☐ Yes ☐ No

**Response:**

```


```

**Error:**

```


```

---

### B-04 — Deposit SUI to manager

**Ask the agent:**

> Deposit 0.1 SUI into my DeepBook balance manager.

**Expected:** `execute_transaction` → `deepbook_deposit` with `amount_display: 0.1`. **Approval bar always shows** with **0.1 SUI** (not “amount pending”). After Approve: digest + receipt **DeepBook transfer**. There is **no protocol minimum** deposit — any positive amount works.

**Also try:** `I want to deposit 1 sui into my deepbook` — same flow; agent must not invent a “1 SUI minimum” rule.

**Pass?** ☐ Yes ☐ No

**Response:**

```


```

**Error:**

```


```

---

### B-05 — Deposit USDC to manager

**Ask the agent:**

> Deposit 1 USDC into my DeepBook balance manager.

**Expected:** Same as B-04 for USDC. Requires USDC in agent wallet.

**Pass?** ☐ Yes ☐ No

**Response:**

```


```

**Error:**

```


```

---

### B-06 — Withdraw SUI from manager

**Ask the agent:**

> Withdraw 0.05 SUI from my DeepBook balance manager.

**Expected:** `execute_transaction` → `deepbook_withdraw`. Approval bar → receipt **DeepBook transfer**. Wallet SUI increases.

**Pass?** ☐ Yes ☐ No

**Response:**

```


```

**Error:**

```


```

---

### B-07 — Withdraw all SUI from manager

**Ask the agent:**

> Withdraw all my SUI from my DeepBook balance manager.

**Expected:** First `deepbook_manager_balance` for SUI, then `deepbook_withdraw` with `withdraw_all: true` (not `amount_display: 0`). Approval bar shows **all SUI (X SUI)** with actual balance. After Approve: manager SUI balance is 0.

**Pass?** ☐ Yes ☐ No

**Response:**

```


```

**Error:**

```


```

---

### B-08 — UI: DeepBook line in agent wallet panel

**Action (not chat):** Open sidebar → Agent wallet → **DeepBook balance manager** section → Refresh.

**Expected:** Matches chat manager balances (or “not provisioned”).

**Pass?** ☐ Yes ☐ No

**Response:**

```


```

**Error:**

```


```

---

## C — Pools & market data (Phase C)

### C-01 — List all pools

**Ask the agent:**

> What DeepBook pools are available?

**Expected:** `query_chain` → `deepbook_pools`. Lists pool keys (e.g. `SUI_USDC`). Default pool mentioned.

**Pass?** ☐ Yes ☐ No

**Response:**

```


```

**Error:**

```


```

---

### C-02 — Default pool info (SUI/USDC)

**Ask the agent:**

> Show me details for the SUI_USDC DeepBook pool — fees, tick size, and lot size.

**Expected:** `query_chain` → `deepbook_pool_info`. On-chain params + ticker if available.

**Pass?** ☐ Yes ☐ No

**Response:**

```


```

**Error:**

```


```

---

### C-03 — Specific pool info (DEEP_USDC)

**Ask the agent:**

> Give me info on the DEEP_USDC pool on DeepBook.

**Expected:** `deepbook_pool_info` with `pool_key: DEEP_USDC`. Reply includes DEEP/USDC pair, last price, min size — **not** “pool unavailable”. Also works if you say `DEEP/USDC` (normalized to `DEEP_USDC`).

**Pass?** ☐ Yes ☐ No

**Response:**

```


```

**Error:**

```


```

---

### C-04 — Live ticker / prices

**Ask the agent:**

> What's the DeepBook ticker? Show me current prices.

**Expected:** `query_chain` → `deepbook_ticker`. Multiple pool last prices.

**Pass?** ☐ Yes ☐ No

**Response:**

```


```

**Error:**

```


```

---

### C-05 — Best SUI/USDC rate

**Ask the agent:**

> What's the best SUI to USDC rate on DeepBook right now?

**Expected:** Uses ticker and/or `swap_quote`. Gives human-readable price.

**Pass?** ☐ Yes ☐ No

**Response:**

```


```

**Error:**

```


```

---

### C-06 — Swap quote only (SUI → USDC, sell side)

**Ask the agent:**

> Quote swapping 1 SUI to USDC on DeepBook. Don't execute yet.

**Expected:** `query_chain` → `swap_quote`, `side: sell`. Receipt: **Swap quote**. No approval bar.

**Pass?** ☐ Yes ☐ No

**Response:**

```


```

**Error:**

```


```

---

### C-07 — Swap quote (USDC → SUI, buy side)

**Ask the agent:**

> Quote buying SUI with 5 USDC on DeepBook.

**Expected:** `swap_quote`, `side: buy`. Quote spends quote coin for base.

**Pass?** ☐ Yes ☐ No

**Response:**

```


```

**Error:**

```


```

---

### C-08 — Swap quote with explicit pool

**Ask the agent:**

> On the WAL_USDC pool, quote swapping 10 WAL to USDC.

**Expected:** `swap_quote` with `pool_key: WAL_USDC` (if pool exists on your network).

**Pass?** ☐ Yes ☐ No

**Response:**

```


```

**Error:**

```


```

---

### C-09 — Small amount quote (min size edge)

**Ask the agent:**

> Quote swapping 0.001 SUI to USDC.

**Expected:** Quote or clear validation message if below `min_size` / `lot_size`.

**Pass?** ☐ Yes ☐ No

**Response:**

```


```

**Error:**

```


```

---

## D — Swaps (Phase D)

### D-01 — Full swap flow (small amount)

**Ask the agent:**

> Swap 0.5 SUI to USDC.

**Expected:** Same turn: `swap_quote` then `execute_transaction` → `swap`. Receipt: **Swap quote**, then approval or **Swap executed**. Agent should **not** ask “want to proceed?” in chat when auto-approve is off.

**Pass?** ☐ Yes ☐ No

**Response:**

```


```

**Error:**

```


```

---

### D-02 — Approval bar appears (auto-approve OFF)

**Setup:** Settings → turn **auto-approve OFF**.

**Ask the agent:**

> Swap 0.3 SUI to USDC.

**Expected:** Inline **Approve swap** bar above input. Receipt: **Swap approval required**.

**Pass?** ☐ Yes ☐ No

**Response:**

```


```

**Error:**

```


```

---

### D-03 — Click Approve on pending swap

**Setup:** Complete D-02 until approval bar is visible.

**Action:** Click **Approve** on the bar (message sent: “Approve transaction”).

**Expected:** Swap executes. Reply mentions digest. Receipt: **Swap executed**. Bar disappears.

**Pass?** ☐ Yes ☐ No

**Response:**

```


```

**Error:**

```


```

---

### D-04 — Cancel pending swap

**Setup:** Trigger approval bar again (auto-approve off).

**Action:** Click **Cancel** on the bar (do not Approve).

**Expected:** Bar closes. No on-chain swap. No false “Transaction sent” receipt.

**Pass?** ☐ Yes ☐ No

**Response:**

```


```

**Error:**

```


```

---

### D-05 — Auto-approve under threshold

**Setup:** Auto-approve **ON**, threshold e.g. **25 SUI**.

**Ask the agent:**

> Swap 1 SUI to USDC.

**Expected:** No approval bar (notional under threshold). Direct **Swap executed** receipt.

**Pass?** ☐ Yes ☐ No

**Response:**

```


```

**Error:**

```


```

---

### D-06 — Auto-approve over threshold

**Setup:** Auto-approve **ON**, threshold lower than swap (e.g. threshold **1 SUI**, swap **5 SUI**).

**Ask the agent:**

> Swap 5 SUI to USDC.

**Expected:** Approval bar appears despite auto-approve on.

**Pass?** ☐ Yes ☐ No

**Response:**

```


```

**Error:**

```


```

---

### D-07 — Swap USDC to SUI (reverse direction)

**Ask the agent:**

> Swap 2 USDC to SUI on DeepBook.

**Expected:** `side: buy` on default pool. Requires USDC in wallet.

**Pass?** ☐ Yes ☐ No

**Response:**

```


```

**Error:**

```


```

---

### D-08 — Natural language swap

**Ask the agent:**

> Convert 0.25 SUI into USDC using DeepBook.

**Expected:** Same as D-01 — quote + execute in one turn.

**Pass?** ☐ Yes ☐ No

**Response:**

```


```

**Error:**

```


```

---

## E — Error handling & edge cases

### E-01 — Insufficient balance for swap

**Ask the agent:**

> Swap 10,000 SUI to USDC.

**Expected:** Friendly explanation (not enough SUI / gas). Receipt may show **Transaction failed**. No raw JSON or error codes in chat.

**Pass?** ☐ Yes ☐ No

**Response:**

```


```

**Error:**

```


```

---

### E-02 — Insufficient balance on Approve

**Setup:** Trigger swap approval for amount you cannot afford → click **Approve**.

**Expected:** Agent explains failure in plain language (e.g. insufficient balance). Not a generic 500.

**Pass?** ☐ Yes ☐ No

**Response:**

```


```

**Error:**

```


```

---

### E-03 — Deposit more than wallet holds

**Ask the agent:**

> Deposit 999 SUI to my DeepBook balance manager.

**Expected:** Fails at execute or approval with clear agent explanation.

**Pass?** ☐ Yes ☐ No

**Response:**

```


```

**Error:**

```


```

---

### E-04 — Withdraw more than manager holds

**Ask the agent:**

> Withdraw 500 SUI from my DeepBook balance manager.

**Expected:** Clear failure + agent explanation.

**Pass?** ☐ Yes ☐ No

**Response:**

```


```

**Error:**

```


```

---

### E-05 — Invalid / unknown pool

**Ask the agent:**

> Quote a swap on the FAKE_XYZ pool on DeepBook.

**Expected:** Validation or unsupported pool error; agent explains without stack trace.

**Pass?** ☐ Yes ☐ No

**Response:**

```


```

**Error:**

```


```

---

### E-06 — Expired approval

**Setup:** Trigger approval bar, wait **15+ minutes**, then click Approve.

**Expected:** Approval not found / expired message.

**Pass?** ☐ Yes ☐ No

**Response:**

```


```

**Error:**

```


```

---

## F — Combined / realistic flows

### F-01 — Check wallet → quote → swap

**Ask the agent:**

> Check my SUI balance, quote swapping half a SUI to USDC, then swap it if I have enough.

**Expected:** Balance query + quote + execute (or explain if insufficient).

**Pass?** ☐ Yes ☐ No

**Response:**

```


```

**Error:**

```


```

---

### F-02 — Deposit then check manager balance

**Ask the agent:**

> Deposit 0.1 SUI to DeepBook, then tell me my manager SUI balance.

**Expected:** Deposit (approval) → follow-up balance read shows increased manager SUI.

**Pass?** ☐ Yes ☐ No

**Response:**

```


```

**Error:**

```


```

---

### F-03 — Compare wallet vs manager

**Ask the agent:**

> How much SUI is in my agent wallet vs my DeepBook balance manager?

**Expected:** Two reads — wallet `balance` + `deepbook_manager_balance`.

**Pass?** ☐ Yes ☐ No

**Response:**

```


```

**Error:**

```


```

---

### F-04 — Market check before swap

**Ask the agent:**

> What's the SUI/USDC price on DeepBook? If it looks reasonable, swap 0.2 SUI to USDC.

**Expected:** Ticker or quote first, then swap in same or follow-up turn.

**Pass?** ☐ Yes ☐ No

**Response:**

```


```

**Error:**

```


```

---

## G — Not yet implemented (optional negative tests)

These features are in the [DeepBook TODO](./deepbook-v3-TODO.md) but **not wired in chat yet**. Use to confirm the agent does not silently succeed.

### G-01 — Open orders

**Ask the agent:**

> Show my open orders on DeepBook.

**Expected:** Agent says unavailable / not implemented, or cannot fulfill. **Not** a fake success.

**Pass?** ☐ Yes ☐ No

**Response:**

```


```

**Error:**

```


```

---

### G-02 — Place limit order

**Ask the agent:**

> Place a limit order to buy SUI at 2 USDC on DeepBook.

**Expected:** Not implemented yet.

**Pass?** ☐ Yes ☐ No

**Response:**

```


```

**Error:**

```


```

---

### G-03 — Stake DEEP

**Ask the agent:**

> Stake 100 DEEP in the SUI pool on DeepBook.

**Expected:** Not implemented yet.

**Pass?** ☐ Yes ☐ No

**Response:**

```


```

**Error:**

```


```

---

### G-04 — Governance vote

**Ask the agent:**

> Vote yes on the latest DeepBook governance proposal.

**Expected:** Not implemented yet.

**Pass?** ☐ Yes ☐ No

**Response:**

```


```

**Error:**

```


```

---

### G-05 — Flash loan

**Ask the agent:**

> Execute a DeepBook flash loan for 1000 USDC.

**Expected:** Not implemented yet (and should not execute without explicit future support).

**Pass?** ☐ Yes ☐ No

**Response:**

```


```

**Error:**

```


```

---

## Summary scorecard

| Section             | Tests  | Passed | Failed | Skipped |
| ------------------- | ------ | ------ | ------ | ------- |
| 0 — Wallet          | 2      |        |        |         |
| B — Balance manager | 8      |        |        |         |
| C — Pools & quotes  | 9      |        |        |         |
| D — Swaps           | 8      |        |        |         |
| E — Errors          | 6      |        |        |         |
| F — Combined flows  | 4      |        |        |         |
| G — Not implemented | 5      |        |        |         |
| **Total**           | **42** |        |        |         |

### Blockers / notes

```


```

---

## Quick copy-paste list (all questions)

```
What is my Sui agent wallet balance?
Show all tokens in my agent wallet on Sui.
Do I have a DeepBook balance manager set up?
What are my DeepBook balance manager balances?
How much SUI is in my DeepBook balance manager?
Deposit 0.1 SUI into my DeepBook balance manager.
Deposit 1 USDC into my DeepBook balance manager.
Withdraw 0.05 SUI from my DeepBook balance manager.
Withdraw all USDC from my DeepBook balance manager.
What DeepBook pools are available?
Show me details for the SUI_USDC DeepBook pool — fees, tick size, and lot size.
Give me info on the DEEP_USDC pool on DeepBook.
What's the DeepBook ticker? Show me current prices.
What's the best SUI to USDC rate on DeepBook right now?
Quote swapping 1 SUI to USDC on DeepBook. Don't execute yet.
Quote buying SUI with 5 USDC on DeepBook.
On the WAL_USDC pool, quote swapping 10 WAL to USDC.
Quote swapping 0.001 SUI to USDC.
Swap 0.5 SUI to USDC.
Swap 0.3 SUI to USDC.
Swap 1 SUI to USDC.
Swap 5 SUI to USDC.
Swap 2 USDC to SUI on DeepBook.
Convert 0.25 SUI into USDC using DeepBook.
Swap 10,000 SUI to USDC.
Deposit 999 SUI to my DeepBook balance manager.
Withdraw 500 SUI from my DeepBook balance manager.
Quote a swap on the FAKE_XYZ pool on DeepBook.
Check my SUI balance, quote swapping half a SUI to USDC, then swap it if I have enough.
Deposit 0.1 SUI to DeepBook, then tell me my manager SUI balance.
How much SUI is in my agent wallet vs my DeepBook balance manager?
What's the SUI/USDC price on DeepBook? If it looks reasonable, swap 0.2 SUI to USDC.
Show my open orders on DeepBook.
Place a limit order to buy SUI at 2 USDC on DeepBook.
Stake 100 DEEP in the SUI pool on DeepBook.
Vote yes on the latest DeepBook governance proposal.
Execute a DeepBook flash loan for 1000 USDC.
```
