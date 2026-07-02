# Radiant landing redesign brief

> **Status (2026-07-02): implemented.** Page order is now Hero → WhatIsIt → CanvasShowcase → DeFiRail → Pillars → HowItWorks → Explorer → Footer. Signature interactions: `RadiantBuddy` mascot (cursor-tracking eyes, head tilt, random blink, poke-squash; idle eye-wander on touch), mouse-parallax hero decor + trailing sparkle, 3D-tilt plane cards, and a self-running canvas node board (GSAP MotionPathPlugin pulse). `ShowcaseSection`/`GlitchPhone` are unused but kept in the repo. All effects honor `prefers-reduced-motion` and `pointer: fine`.

> **The pivot:** Radiant is no longer sold as "an agent that builds you apps."
> It's **an agent that runs live workflows for you** — say what you want in
> plain language, and Radiant turns it into a running, autonomous machine that
> trades, bridges, watches markets, and acts on your behalf.

This document is the source of truth for rebuilding the landing page (`client/src/app/page.tsx` and `client/src/components/landing/*`). It maps **what is actually implemented today** to the **story we should tell** and **what each section should show**.

Keep the existing visual language: neo-brutalist (2px ink borders, hard offset shadows `shadow-[6px_6px_0]`, bright flat accents), GSAP scroll animation, `prefers-reduced-motion` respected. Palette tokens already in code:

| Token | Hex | Use |
|-------|-----|-----|
| `--hero-ink` | `#1b1610` | text / borders |
| `--hero-bg` | `#faf6ec` | page background |
| `--hero-coral` | `#ff5d46` | "acts" / execution |
| `--hero-blue` | `#3865ff` | data / feeds |
| `--hero-mint` | `#00c478` | live / automation |
| `--hero-amber` | `#ffb01f` | earn / highlight |
| `--hero-violet` | `#8e5bff` | AI / reasoning |

---

## 1. Why the pivot

The old landing (Hero → Showcase → Pillars → HowItWorks → Explorer → Footer) leans on **"you said it, Radiant built you an app"** (`ShowcaseSection` cycles Stash / Cashout / AutoStake / Splitz / Pulse phone apps). That app-builder story is still true and still shipping — but it undersells what actually got built since.

The real center of gravity now is **two planes that share one wallet stack**:

- **Chat plane** — conversational agent that acts, remembers, builds, earns (existing).
- **Canvas plane** — a visual, node-based **workflow builder**: describe a strategy, the Builder agent assembles a live node graph, you dry-run it with real market previews, then flip it to **Live** with a compiled per-workflow policy. (`docs/canvas-workflows-architecture-TODO.md`)

Plus a **real DeFi execution backend** behind both planes: DeepBook (swaps, CLOB orders, **flash loans**, margin, staking), Li-Fi cross-chain swap/bridge, Squid cross-chain, Soroswap on Stellar, Polymarket prediction markets.

**New one-liner options (Hero `EvolvingWord` rotation):**

- "Your personal AI agent that **runs your money on autopilot**."
- rotating verbs: `trades for you` · `watches the market` · `bridges any chain` · `runs while you sleep` · `builds you workflows`

---

## 2. What actually exists (feature inventory)

Grounded in the codebase — use this so landing copy stays honest. Flagged **Live** = real external side effects today; **Sim** = simulated / dry-run only; **Soon** = scaffolded.

### 2a. The agent (Chat plane)
- **Agent wallet auto-provisioned on signup** via Privy embedded wallets — Sui (default), EVM (one `0x` for all EVM chains), Solana. Keys in Privy enclave; Radiant never holds them. (`client/AGENTS.md`, `AgentWalletProvider`)
- **Acts:** `execute_transaction` / `query_chain` tools — transfers, swaps, staking, balance/price reads. **Live.**
- **Remembers:** persistent memory + credential vault (Walrus blobs), per user. **Live (design).**
- **Builds:** generates + deploys real apps to Walrus Sites / Sui, owned by your wallet. **Live (pipeline).**
- **Earns:** list apps in the Explorer marketplace, collect a fee onchain per use.
- **Approvals:** large transactions return `pending_transaction` → `TransactionApprovalModal`; small ones auto-run under permissions.

### 2b. DeFi execution backend (`backend/src/services/defi`, `.../agent/prompts/protocols`)
| Capability | Provider | Status |
|-----------|----------|--------|
| Spot swap (best rate) | **DeepBook** CLOB routing | Live |
| **Flash loans** (round-trip + swap-chain-repay, auto-routed) | DeepBook | Live-gated ("Allow flash loans" in Settings) |
| Limit / market orders (CLOB) | DeepBook | Live |
| Margin, staking, governance, predict | DeepBook | Live/partial |
| Cross-chain swap + bridge | **Li-Fi** | Live (mock unless configured) |
| Cross-chain routing | **Squid** | Live |
| Stellar swaps + routing fallback | **Soroswap** | Live (with `StellarRoutingFallbackDialog` consent flow) |
| Prediction markets (order book, place/cancel) | **Polymarket** | Live |
| Prediction markets | **Limitless** | Soon (badged "coming soon") |
| Whale-tx tracking, price feeds, valuation | CoinGecko + on-chain | Live |

### 2c. Canvas — visual workflow builder (`client/src/components/canvas`, `docs/canvas-nodes-reference.md`)
- **Builder agent**: natural language → node graph, streamed live over SSE (`CanvasBuilderActivity`).
- **Tester**: dry-run the whole graph with **real market data previews** before any money moves.
- **Live mode**: per-workflow **policy compiled into the runtime** — max spend, kill switch, approval gates (`CanvasPolicyPanel`).
- **38 node types** across groups: **Workflow** (Start, Approve, Stop, Schedule/Cron, Notify, Delay) · **Data & Feeds** (Price Chart, Whale Tracker, Wallet Balance, Polymarket feed/positions) · **Logic** (IF, Compare, Threshold, Policy Gate, Dry-run Gate) · **AI** (AI Reasoning) · **Actions** (Place Order, Swap, Bridge, Copy Trade, Transfer, Li-Fi Quote) · **UI** (Table, Label, Chart, Button) monitor panels.
- **Live monitor UI**: sparkline/series charts (`PriceChartNode`, UI Chart), live order-book tables (UI Table), price labels — the workflow renders its own dashboard.
- Sample workflows already in-app: **BTC dip buyer**, **Whale copy trade**, **ETH limit ladder**, **Sui weekly rebalance**.

### 2d. Notifications (`backend/src/services/notifications`)
- Rule engine: event / poll / schedule conditions, web push + email delivery, per-user preferences. Real, deep subsystem — worth one line on the page ("Radiant pings you when your rules fire").

---

## 3. New landing structure (section by section)

Proposed order. **Bold** = new or heavily reworked vs today.

```
Hero  →  WhatIsIt (two planes)  →  CanvasShowcase*  →  DeFiRail*  →
Pillars (reframed)  →  WorkflowGallery*  →  HowItWorks  →  Explorer  →  Footer
```
`*` = new sections.

### 3.1 Hero (rework `hero/Hero.tsx`)
- **Keep** the layout, chips, marquee, decor. **Change the message** from "builds apps" to "runs workflows."
- Headline: `Your personal AI agent that` + `EvolvingWord` rotating: **trades for you · watches the market · bridges any chain · runs while you sleep**.
- Sub: "A wallet, a memory, and hands — plus a canvas. Describe a strategy in plain language; Radiant builds it into a live workflow and runs it for you."
- Chips: keep `wallet` / `memory` / `hands`, **add** `canvas`.
- Marquee (`MARQUEE_COMMANDS`) — swap to workflow-flavored commands:
  - "Buy the BTC dip and alert me"
  - "Copy every whale over $1M"
  - "Ladder ETH limit sells from $4k–$5k"
  - "Rebalance my Sui bag every Friday"
  - "Flash-loan arb SUI/USDC when spread > 0.4%"
  - "Bridge my USDC to Base at the best rate"
- Two CTAs: **Try Radiant** (primary) + **See what it runs** (scroll) — and keep **Browse Explorer**.

### 3.2 WhatIsIt — "Two ways to command it" (NEW)
Two big side-by-side neo-brutalist cards:

| Chat | Canvas |
|------|--------|
| **Just say it.** Coral accent. "Pay Alex 5 SUI." "Swap USDC → SUI at the best rate." Radiant signs and executes. One-off actions, in words. | **Wire it up.** Mint accent. "Buy the dip, but only if the whale wallet buys first." Radiant assembles a live node graph you can watch, dry-run, and set loose. |

Caption under both: *"Same wallet. Same memory. One is a sentence, the other is a machine."*

### 3.3 CanvasShowcase — "Watch it think" (NEW, hero of the page)
This is the section that sells the pivot. Show the **canvas itself**, not phone apps.

- Left: a stylized node graph — `Whale Tracker → Threshold → AI Reason → Policy Gate → Place Order → Notify` with animated edges (reuse `AnimatedEdge` styling). Nodes labeled, color-coded by group.
- Right: rotating scroll-driven copy (mirror `ShowcaseSection`'s scroll mechanic) cycling 3–4 real sample workflows:
  1. **BTC dip buyer** — "Threshold on price → dry-run gate → market buy. Live in 2 minutes."
  2. **Whale copy trade** — "Watch a wallet, mirror its trades under your spend cap."
  3. **ETH limit ladder** — "Stack limit sells across a price range on DeepBook's CLOB."
  4. **Sui weekly rebalance** — "Cron → wallet balance → compare → swap to target weights."
- Callouts on the graph: **"Dry-run with real data"**, **"Policy caps every order"**, **"Live monitor charts built in"**.
- Tag line: *"You describe it. The Builder agent wires it. You dry-run it. Then you flip it Live."*

### 3.4 DeFiRail — "Real rails underneath" (NEW)
A horizontal marquee/logo rail + short grid establishing this isn't a toy. Group as:

- **Trade** — DeepBook swaps, CLOB limit/market orders, margin.
- **Leverage** — DeepBook **flash loans** (atomic round-trip & swap-chain arb, auto-routed across pools).
- **Cross-chain** — Li-Fi + Squid swap & bridge; Soroswap on Stellar.
- **Predict** — Polymarket order books & positions.
- **Watch** — whale tracking, live price feeds, valuation.

Copy: *"Radiant doesn't fake execution. Orders hit DeepBook's shared order book, bridges route through Li-Fi and Squid, and every live order passes your policy gate first."* Be honest — footnote which are simulated in dry-run.

**Protocol logos** — all six are downloaded and live in `client/public/logos/`, ready to `<Image>` into the rail:

| Protocol | Asset | Format | Source |
|----------|-------|--------|--------|
| DeepBook | `/logos/deepbook.png` | PNG 512² | deepbook.tech brand mark |
| Li-Fi | `/logos/lifi.svg` | SVG | li.fi official mark |
| Squid | `/logos/squid.svg` | SVG (purple icon) | docs.squidrouter.com brand assets |
| Soroswap | `/logos/soroswap.png` | PNG 192² | soroswap.finance app icon |
| Polymarket | `/logos/polymarket.png` | PNG 192² | (already in repo) |
| Limitless | `/logos/limitless.svg` | SVG | (already in repo) |

Rail implementation notes:
- SVGs (Li-Fi, Squid, Limitless) are single-color/brand-color marks — render at a fixed height (`h-8`/`h-10`) and let width flow.
- PNGs (DeepBook, Soroswap, Polymarket) are square icons — wrap in a same-size rounded tile so the rail reads evenly; consider a subtle grayscale→color hover for the neo-brutalist feel.
- Limitless carries a **"coming soon"** badge (matches its node status); everything else is live.
- Keep the `polymarket.png` file mode readable (`chmod` if it 404s in dev — it was created `-rw-------`).

### 3.5 Pillars (reframe `PillarsSection.tsx`)
Keep the 4-card format + animation. Reframe copy so it covers **both planes**:

| Icon | Title | New copy |
|------|-------|----------|
| Hand (coral) | **It acts** | Swaps, orders, bridges, flash loans — signed and executed. In chat or on the canvas. |
| Brain (violet) | **It watches** | Live feeds, whale wallets, price thresholds. Your workflows react the moment conditions hit. |
| Hammer (mint) | **It automates** | Describe a strategy; Radiant wires a node graph, dry-runs it on real data, and runs it live under your caps. |
| Coins (amber) | **It earns** | Build once, list it on the Explorer, and collect a fee onchain every time someone runs it. |

(Was: acts / remembers / builds / earns. "Remembers" moves into WhatIsIt caption; "watches" + "automates" carry the workflow story.)

### 3.6 WorkflowGallery — "Steal a workflow" (NEW)
Grid of ready-to-fork workflow cards (from `sample-workflows.ts`), each with a status pill (`live` / `dry` / `draft`), last-run time, and the node chain as tiny glyphs. CTA per card: **"Open in Canvas."** Reinforces that workflows are shareable/forkable, not bespoke.

### 3.7 HowItWorks (light rework `HowItWorksSection.tsx`)
Re-tell the 3–4 steps around workflows: **Describe → Builder wires it → Dry-run on real data → Flip to Live (policy-gated).** Keep for the chat path too: **Say it → Approve → Done.**

### 3.8 Explorer (keep `ExplorerSection.tsx`)
Still valid — public marketplace of callable apps/workflows with onchain fees. Extend copy: "…and workflows other agents can trigger."

### 3.9 Footer (keep `FooterSection.tsx`)
Add Docs / Canvas / Explorer links.

---

## 4. Messaging cheatsheet

**Positioning:** *Radiant is the agent that turns a sentence into a live, running money machine.*

- Lead with **outcome + autonomy**, not "AI" or "app builder."
- Verbs that carry the new story: **runs, trades, watches, bridges, arbs, rebalances, copies, alerts.**
- Trust anchors to repeat: **dry-run on real data**, **policy caps every order**, **you approve big moves**, **your keys, your wallet**.
- Honesty guardrail: don't imply HFT or that everything is live — Live = Polymarket orders, Li-Fi/Squid/DeepBook execution, policy enforcement; other nodes simulate in dry-run (`docs/canvas-nodes-reference.md`).

**Do-not-say:** "no-code tool," "just a chatbot," "just a DeFi app" — the existing Pillars eyebrow already disavows these; keep it.

---

## 5. Build notes for implementation

- New sections are additive components under `client/src/components/landing/`; wire them into `client/src/app/page.tsx` in the order in §3.
- Reuse existing primitives: `AnimatedEdge`, `RichNode`, `node-glyph.tsx`, `PriceChartNode` (for the CanvasShowcase graph), `Scramble`, `WordReveal`, `useReducedMotion`.
- Pull live-ish sample data from `client/src/components/canvas/sample-workflows.ts` and `node-catalog.ts` so the gallery matches the real product.
- Keep GSAP `ScrollTrigger` patterns and the `prefers-reduced-motion` guard used across current sections.
- Run `npm run lint` + `npm run build` before shipping (per `client/AGENTS.md` pre-ship checklist).

---

## 6. Open questions for product

1. **Canvas availability** — is Canvas public/GA or waitlisted? Determines whether CTAs say "Try" or "Join the beta."
2. **Flash loans on landing** — powerful hook, but gated + advanced. Feature it prominently or keep it in the DeFiRail footnote?
3. **Chains to show** — Sui is default; how loudly do we advertise EVM/Solana/Stellar given execution maturity per chain?
4. **Which sample workflows** are safe to show as "live" vs "dry" on a public page?
