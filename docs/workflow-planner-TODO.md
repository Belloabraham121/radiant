# Workflow Planner + Clarification — Implementation Plan

> **Status: implemented** (wf-1 … wf-14). Optional items wf-15 … wf-17 were cancelled.

Review this list and **delete or strike through** anything you do not want before implementation starts.
No pidgin-specific handling — general natural-language understanding via LLM + validation gates.

---

## Problem (today)

| Issue | Cause |
|-------|--------|
| Comma chains not detected | `workflow-parser.ts` only splits on `then` / `when you're done` |
| "Deposit it" fails | Regex requires explicit amounts |
| Typos like "with all" | `extractWithdrawIntent` needs exact `withdraw` |
| Wrong step executed | Segment misclassified as pool query (`sui/usdc` heuristic) |
| No verify-before-execute | Regex/LLM fires tools without structured clarification |
| Approval bar doesn't chain | Client fixed; backend may return wrong step type |

**Root cause:** Regex is the **gate** for multi-step workflows. LLM chat is the **fallback**. We need the inverse for complex messages.

---

## Target architecture

```
User message
    ↓
LLM Workflow Planner (structured JSON, NO tool calls)
    ↓
Plan Validator (schema + confidence + preflight)
    ↓
Needs clarification? ──Yes──→ Yes/No UI → re-plan → validate again
    ↓ No
Sequential Workflow Runner (existing, extended)
    ↓
Step ledger updated (outputs for "it" / "that")
    ↓
Needs tx approval? ──Yes──→ TransactionApprovalBar → auto-continue
    ↓
Done
```

### Three roles (never mixed)

| Role | Does | Executes txs? |
|------|------|---------------|
| **Planner** | Understand message → propose steps with slots | No |
| **Validator** | Check completeness, confidence, chain rules | No |
| **Executor** | `runAgentTool` / workflow-runner | Yes (after approval) |

---

## New backend files

| File | Purpose |
|------|---------|
| `workflow/workflow-planner.ts` | OpenAI structured call → `PlannerOutput` |
| `workflow/workflow-plan-validator.ts` | Confidence, assumptions, schema, preflight |
| `workflow/workflow-ledger.ts` | Per-step outputs; resolve `ref(stepN.*)` |
| `workflow/clarification.types.ts` | `ClarificationRequest`, options, bindings |
| `workflow/clarification.store.ts` | In-memory clarification state (like pending txs) |
| `workflow/planner-prompt.ts` | System prompt for planner only |

## Modified backend files

| File | Change |
|------|--------|
| `workflow/workflow.types.ts` | Slots, ledger, `paused_clarification`, clarification on outcome |
| `workflow/session-workflow.store.ts` | Ledger + clarification fields on state |
| `workflow/workflow-runner.ts` | Resolve refs at step start; update ledger after step |
| `chat-orchestrator.ts` | **Remove** `parseWorkflowPlan` gate → planner path |
| `chat.service.ts` | Handle `clarification_response` |
| `agent.types.ts` | `pending_clarification` on `ChatResponse`; extend `chatRequestSchema` |
| `runtime/prompts.ts` | Allow clarification questions; keep tx approval in app UI |

## New client files

| File | Purpose |
|------|---------|
| `components/app/ClarificationBar.tsx` | Yes / No (intent verify, not sign) |

## Modified client files

| File | Change |
|------|--------|
| `lib/chat-api.ts` | `PendingClarification`, request/response fields |
| `hooks/useChatSession.ts` | `pendingClarification`, `respondClarification` |
| `components/app/ChatView.tsx` | Render `ClarificationBar` above input |
| `lib/chat-session-cache.ts` | Cache clarification state on navigation |

---

## What to REMOVE (recommended)

Review each — strike if you want to keep it.

### Remove as primary path

- [ ] **`parseWorkflowPlan()` gate** in `chat-orchestrator.ts` (lines 47–67)
- [ ] **`SEQUENTIAL_SPLIT` / `SEQUENTIAL_MARKER`** in `workflow-parser.ts` as workflow entry condition
- [ ] **`workflow-parser.test.ts`** — replace with planner/validator tests (or delete file)
- [ ] **Entire `workflow-parser.ts`** — after planner is stable (optional: keep as dev fallback behind flag → see wf-17)

### Do NOT remove (keep and extend)

- `workflow-runner.ts` — sequential execution + approval pause/resume
- `session-workflow.store.ts` — extend, don't replace
- `transaction-approval.service.ts` — unchanged role
- `TransactionApprovalBar.tsx` — separate from clarification
- `deposit-approval-flow.ts` / `withdraw-approval-flow.ts` — may keep for **single-turn** chat nudges until planner covers all paths

---

## Clarification design

### When to clarify (validator triggers)

- Planner `confidence < 0.90` (tunable)
- Any `assumptions[]` entry (typo interpretation, implicit ref)
- Slot type `missing` or unresolved `ref`
- Preflight failure that has a skip alternative (e.g. below min order size)

### UI

```text
"Did you mean withdraw all SUI from your DeepBook balance manager?"
[ Yes ]  [ No ]
```

- **Yes** → merge binding → re-validate → continue workflow
- **No** → **skip that step** (default policy; cancel-whole-workflow is optional)

### API shape (proposed)

```typescript
// ChatRequest
clarification_id?: string;
clarification_response?: "yes" | "no";

// ChatResponse
pending_clarification: {
  id: string;
  question: string;
  step_index?: number;
  plan_preview?: string;  // optional summary
} | null;
```

---

## Planner output shape (proposed)

```typescript
type PlanSlot =
  | { kind: "literal"; value: number | string | boolean }
  | { kind: "ref"; step_index: number; field: "output_amount" | "output_coin" }
  | { kind: "missing" };

type PlannedStep = {
  action: string;  // deepbook_deposit | swap | ...
  label: string;
  params: Record<string, PlanSlot | unknown>;
};

type PlannerOutput = {
  steps: PlannedStep[];
  assumptions: { field: string; interpreted: string; from_phrase: string }[];
  confidence: number;  // 0–1
  needs_clarification: boolean;
  clarification?: { question: string };
};
```

Validator resolves slots → concrete `ExecuteTransactionInput` before runner sees them.

---

## Step ledger (for "deposit it")

After each executed step:

```typescript
{
  step_index: 1,
  action: "swap",
  input_coin: "USDC",
  input_amount: 1.6,
  output_coin: "SUI",
  output_amount_est: 1.59,  // from quote or tx result
  digest?: string,
}
```

`deposit it` → planner emits `ref(step2.output_amount)` → validator resolves or clarifies.

---

## Implementation order

| Phase | Tasks | Depends on |
|-------|-------|------------|
| **A — Types & API** | wf-1, wf-6 | — |
| **B — Planner** | wf-2, wf-11 | A |
| **C — Validator** | wf-3 | A, B |
| **D — Clarification** | wf-5, wf-7 | A, C |
| **E — Ledger + Runner** | wf-4, wf-8 | D |
| **F — Client UI** | wf-9, wf-10 | A, D |
| **G — Remove regex gate** | wf-12 | B, C, tests |
| **H — Tests** | wf-13, wf-14 | All |

---

## Optional items (delete from scope if unwanted)

| ID | Item | Default recommendation |
|----|------|------------------------|
| wf-15 | Full plan preview yes/no for 3+ steps | **Skip v1** — per-step clarify is enough |
| wf-16 | Postgres persistence | **Skip v1** — in-memory TTL like pending txs |
| wf-17 | Regex fast-path fallback | **Remove** — LLM-only planner |

---

## Test scenarios (acceptance)

1. `swap 1.6 SUI to USDC, swap 1.6 USDC to SUI, deposit it into DeepBook, buy 0.1 SUI at 2 USDC`
   - Clarify deposit amount from step 2 → Yes → 4-step workflow → approvals chain

2. `with all SUI from deepbook, then swap 1.6 to USDC` (typo)
   - Clarify "withdraw all SUI?" → Yes → continue

3. Clarification **No** → step skipped, workflow continues or stops cleanly

4. Below min order size → clarify to skip order step, not silent prose

5. Single clear message `swap 1 SUI to USDC` → no clarification → direct execute + approval

---

## Policy defaults (confirm or change)

| Decision | Default |
|----------|---------|
| On clarification **No** | Skip that step only |
| Confidence threshold | 0.90 |
| Comma-separated lists | Treat as sequential |
| Planner model | Same as agent (OpenAI structured output) |
| Pidgin handling | **None** — general NL via planner prompt only |

---

## Cursor todo IDs

See workspace todos `wf-1` … `wf-17`. Cancel any optional items you don't want before saying "go".
