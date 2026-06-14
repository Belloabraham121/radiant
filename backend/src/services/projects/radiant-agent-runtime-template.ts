/** Template files for generated app agent runtime (Phase 4). */

export const RADIANT_AGENT_RUNTIME_TS = `/** Agent UI runtime — register local handlers + execute via radiant-client. */
import { executeAction, type AppActionResult } from "./radiant-client";

export type RadiantAgentExecuteOptions = {
  animate?: boolean;
};

export type RadiantAgentContext = {
  animate: boolean;
  highlight: (targetId: string, className?: string) => void;
};

export type RadiantAgentHandler = (
  params: Record<string, unknown>,
  ctx: RadiantAgentContext,
) => void | Promise<void>;

export type RadiantAgentEvent =
  | { type: "active"; active: boolean }
  | { type: "executing"; action: string; params: Record<string, unknown> }
  | { type: "result"; action: string; result: AppActionResult };

type Listener = (event: RadiantAgentEvent) => void;

const handlers = new Map<string, RadiantAgentHandler>();
const listeners = new Set<Listener>();
let activeCount = 0;

function emit(event: RadiantAgentEvent) {
  listeners.forEach((listener) => {
    try {
      listener(event);
    } catch {
      // ignore subscriber errors
    }
  });
}

function highlightTarget(targetId: string, className = "agent-focused") {
  if (typeof document === "undefined") return;
  const el = document.querySelector('[data-radiant-id="' + targetId + '"]');
  if (!el) return;
  el.classList.add(className);
  window.setTimeout(() => el.classList.remove(className), 1200);
}

function setFieldValue(targetId: string, value: unknown) {
  if (typeof document === "undefined") return;
  const el = document.querySelector('[data-radiant-id="' + targetId + '"]');
  if (!el) return;
  if (
    el instanceof HTMLInputElement ||
    el instanceof HTMLTextAreaElement ||
    el instanceof HTMLSelectElement
  ) {
    el.value = String(value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  }
}

function createContext(animate: boolean): RadiantAgentContext {
  return {
    animate,
    highlight: (targetId, className) => highlightTarget(targetId, className ?? "agent-focused"),
  };
}

export const radiantAgent = {
  register(action: string, handler: RadiantAgentHandler) {
    handlers.set(action, handler);
  },
  subscribe(listener: Listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  isActive() {
    return activeCount > 0;
  },
  handleExternalEvent(data: Record<string, unknown>) {
    if (!data || data.type !== "radiant-agent-event") return;
    const target = typeof data.target === "string" ? data.target : null;
    if (target) {
      highlightTarget(target, "agent-focused");
      if (data.value !== undefined && data.value !== null) {
        setFieldValue(target, data.value);
      }
    }
    if (data.active === true) {
      emit({ type: "active", active: true });
    }
    if (data.active === false) {
      emit({ type: "active", active: false });
    }
    const action = typeof data.action === "string" ? data.action : null;
    const params =
      data.params && typeof data.params === "object"
        ? (data.params as Record<string, unknown>)
        : null;
    if (action && data.animate === true && params) {
      const handler = handlers.get(action);
      if (handler) {
        void handler(params, createContext(true));
      }
      emit({ type: "executing", action, params });
    } else if (action && data.step === "executing") {
      emit({
        type: "executing",
        action,
        params: params ?? {},
      });
    }
    if (action && data.step === "result" && data.digest && typeof data.digest === "string") {
      emit({
        type: "result",
        action,
        result: {
          status: "executed",
          digest: data.digest,
          explorer_url: null,
          result: {},
        },
      });
      if (data.refresh === true && typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("radiant-agent-refresh"));
      }
    }
  },
  async execute(
    action: string,
    params: Record<string, unknown> = {},
    opts: RadiantAgentExecuteOptions = {},
  ): Promise<AppActionResult> {
    activeCount += 1;
    emit({ type: "active", active: true });
    emit({ type: "executing", action, params });
    try {
      const animate = Boolean(opts.animate);
      const handler = handlers.get(action);
      if (animate && handler) {
        await handler(params, createContext(true));
      }
      const result = await executeAction(action, params);
      emit({ type: "result", action, result });
      return result;
    } finally {
      activeCount = Math.max(0, activeCount - 1);
      if (activeCount === 0) {
        emit({ type: "active", active: false });
      }
    }
  },
};

declare global {
  interface Window {
    __radiantAgent?: typeof radiantAgent;
  }
}

if (typeof window !== "undefined") {
  window.__radiantAgent = radiantAgent;
}
`;

export const AGENT_INDICATOR_TSX = `"use client";

import { useEffect, useState } from "react";

type RadiantAgentEvent = {
  type: string;
  active?: boolean;
};

declare global {
  interface Window {
    __radiantAgent?: {
      subscribe: (listener: (event: RadiantAgentEvent) => void) => () => void;
    };
  }
}

export function useRadiantAgent() {
  const [active, setActive] = useState(false);

  useEffect(() => {
    const agent = typeof window !== "undefined" ? window.__radiantAgent : undefined;
    if (!agent) return;
    return agent.subscribe((event) => {
      if (event.type === "active") {
        setActive(Boolean(event.active));
      }
    });
  }, []);

  return { active };
}

export function AgentIndicator() {
  const { active } = useRadiantAgent();
  if (!active) return null;

  return (
    <div className="radiant-agent-indicator" role="status" aria-live="polite">
      <span className="radiant-agent-indicator-dot" aria-hidden />
      Agent working…
    </div>
  );
}
`;

export const AGENT_STYLES_CSS = `.radiant-agent-indicator {
  position: fixed;
  bottom: 1rem;
  right: 1rem;
  z-index: 50;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 0.875rem;
  border-radius: 9999px;
  border: 2px solid var(--hero-ink);
  background: white;
  box-shadow: 3px 3px 0 var(--hero-violet);
  font-size: 0.75rem;
  font-weight: 700;
  color: var(--hero-ink);
}

.radiant-agent-indicator-dot {
  width: 0.5rem;
  height: 0.5rem;
  border-radius: 9999px;
  background: var(--hero-violet);
  animation: radiant-agent-pulse 1s ease-in-out infinite;
}

@keyframes radiant-agent-pulse {
  0%,
  100% {
    opacity: 0.45;
    transform: scale(0.9);
  }
  50% {
    opacity: 1;
    transform: scale(1.1);
  }
}

[data-radiant-id].agent-focused {
  outline: 2px solid var(--hero-violet);
  outline-offset: 2px;
  transition: outline-color 0.2s ease;
}

[data-radiant-id].agent-clicking {
  transform: scale(0.98);
  transition: transform 0.15s ease;
}
`;

export const SWAP_FORM_SCAFFOLD_TSX = `"use client";

import { useCallback, useEffect, useState } from "react";
import { swapQuote } from "../lib/radiant-client";

export default function SwapForm() {
  const [amount, setAmount] = useState("1");
  const [side] = useState<"buy" | "sell">("sell");
  const [quoteLabel, setQuoteLabel] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refreshQuote = useCallback(async () => {
    const parsed = Number(amount);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return;
    }
    const quote = await swapQuote({ side, amount: parsed, pool_key: "SUI_USDC" });
    setQuoteLabel("~" + quote.output_amount_display + " " + quote.output_coin);
  }, [amount, side]);

  useEffect(() => {
    const agent = typeof window !== "undefined" ? window.__radiantAgent : undefined;
    if (!agent) return;
    agent.register("swap", async (params, ctx) => {
      const swapAmount = params.amount ?? params.amount_display;
      if (swapAmount != null) {
        const el = document.querySelector('[data-radiant-id="amount-in"]');
        if (el instanceof HTMLInputElement) {
          el.value = String(swapAmount);
          el.dispatchEvent(new Event("input", { bubbles: true }));
        }
      }
      ctx.highlight("swap-submit", "agent-clicking");
    });
    const unsubscribe = agent.subscribe((event) => {
      if (event.type !== "result" || event.action !== "swap") return;
      if (event.result.status === "executed") {
        setStatus("Submitted — digest " + event.result.digest);
      }
    });
    function onAgentRefresh() {
      void refreshQuote();
    }
    window.addEventListener("radiant-agent-refresh", onAgentRefresh);
    return () => {
      unsubscribe();
      window.removeEventListener("radiant-agent-refresh", onAgentRefresh);
    };
  }, [refreshQuote]);

  async function handleQuote() {
    setStatus(null);
    const parsed = Number(amount);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      setStatus("Enter a valid amount");
      return;
    }
    await refreshQuote();
  }

  async function handleSwap() {
    const agent = typeof window !== "undefined" ? window.__radiantAgent : undefined;
    if (!agent) {
      setStatus("Agent runtime not loaded");
      return;
    }
    const parsed = Number(amount);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      setStatus("Enter a valid amount");
      return;
    }
    setBusy(true);
    setStatus(null);
    try {
      const result = await agent.execute(
        "swap",
        { side, amount: parsed, pool_key: "SUI_USDC" },
        { animate: true },
      );
      if (result.status === "executed") {
        setStatus("Submitted — digest " + result.digest);
      } else if (result.status === "approval_required") {
        setStatus("Approve the transaction in the bar above");
      }
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Swap failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mx-auto max-w-md space-y-4 rounded-2xl border-2 border-[var(--hero-ink)] bg-white p-6 shadow-[4px_4px_0_var(--hero-ink)]">
      <h1 className="text-xl font-extrabold">Swap</h1>
      <label className="block text-sm font-semibold">
        Amount (SUI)
        <input
          data-radiant-id="amount-in"
          className="mt-1 w-full rounded-lg border-2 border-[var(--hero-ink)] px-3 py-2"
          value={amount}
          onChange={(event) => setAmount(event.target.value)}
        />
      </label>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="rounded-full border-2 border-[var(--hero-ink)] px-4 py-2 text-sm font-bold"
          onClick={() => void handleQuote()}
        >
          Get quote
        </button>
        <button
          type="button"
          data-radiant-id="swap-submit"
          disabled={busy}
          className="rounded-full border-2 border-[var(--hero-ink)] bg-[var(--hero-ink)] px-4 py-2 text-sm font-bold text-[var(--hero-bg)] disabled:opacity-50"
          onClick={() => void handleSwap()}
        >
          {busy ? "Swapping…" : "Swap"}
        </button>
      </div>
      {quoteLabel ? <p className="text-sm font-semibold text-[var(--hero-ink)]/70">{quoteLabel}</p> : null}
      {status ? <p className="text-sm font-semibold text-[var(--hero-violet)]">{status}</p> : null}
    </section>
  );
}
`;

export const DEX_APP_SCAFFOLD_TSX = `"use client";

import { useCallback, useEffect, useState } from "react";
import {
  flashLoanQuote,
  governanceState,
  openOrders,
  stakeBalance,
  swapQuote,
} from "../lib/radiant-client";

type TabId = "swap" | "flash_loan" | "stake" | "governance" | "orders";

const POOL_KEY = "SUI_USDC";
const TABS: Array<{ id: TabId; label: string }> = [
  { id: "swap", label: "Swap" },
  { id: "flash_loan", label: "Flash loan" },
  { id: "stake", label: "Stake" },
  { id: "governance", label: "Governance" },
  { id: "orders", label: "Orders" },
];

function panelClass() {
  return "rounded-2xl border-2 border-[var(--hero-ink)] bg-white p-6 shadow-[4px_4px_0_var(--hero-ink)]";
}

export default function DexApp() {
  const [tab, setTab] = useState<TabId>("swap");
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [swapAmount, setSwapAmount] = useState("1");
  const [swapQuoteLabel, setSwapQuoteLabel] = useState<string | null>(null);

  const [flashAmount, setFlashAmount] = useState("100");
  const [flashAsset, setFlashAsset] = useState<"base" | "quote">("base");
  const [flashQuoteLabel, setFlashQuoteLabel] = useState<string | null>(null);

  const [stakeAmount, setStakeAmount] = useState("10");
  const [stakeInfo, setStakeInfo] = useState<string | null>(null);

  const [govInfo, setGovInfo] = useState<string | null>(null);
  const [proposalDesc, setProposalDesc] = useState("");
  const [voteId, setVoteId] = useState("");

  const [orders, setOrders] = useState<Array<Record<string, unknown>>>([]);

  const refreshSwapQuote = useCallback(async () => {
    const parsed = Number(swapAmount);
    if (!Number.isFinite(parsed) || parsed <= 0) return;
    const quote = await swapQuote({ side: "sell", amount: parsed, pool_key: POOL_KEY });
    setSwapQuoteLabel("~" + quote.output_amount_display + " " + quote.output_coin);
  }, [swapAmount]);

  const loadStakeBalance = useCallback(async () => {
    const data = await stakeBalance(POOL_KEY);
    const total = typeof data.total_stake === "number" ? data.total_stake : 0;
    setStakeInfo("Staked DEEP: " + total);
  }, []);

  const loadGovernance = useCallback(async () => {
    const data = await governanceState(POOL_KEY);
    const stakeRequired =
      typeof data.current_epoch === "object" &&
      data.current_epoch &&
      "stake_required" in data.current_epoch
        ? String((data.current_epoch as { stake_required?: unknown }).stake_required)
        : "?";
    setGovInfo("Stake required this epoch: " + stakeRequired);
  }, []);

  const loadOrders = useCallback(async () => {
    const data = await openOrders(POOL_KEY);
    const list = Array.isArray(data.orders) ? (data.orders as Array<Record<string, unknown>>) : [];
    setOrders(list);
  }, []);

  useEffect(() => {
    const agent = typeof window !== "undefined" ? window.__radiantAgent : undefined;
    if (!agent) return;

    agent.register("swap", async (params, ctx) => {
      const swapVal = params.amount ?? params.amount_display;
      if (swapVal != null) {
        setSwapAmount(String(swapVal));
        setTab("swap");
      }
      ctx.highlight("swap-submit", "agent-clicking");
    });

    agent.register("flash_loan", async (params, ctx) => {
      if (params.borrow_amount != null) {
        setFlashAmount(String(params.borrow_amount));
        setTab("flash_loan");
      }
      ctx.highlight("flash-loan-submit", "agent-clicking");
    });

    agent.register("stake", async (params, ctx) => {
      if (params.amount_display != null) {
        setStakeAmount(String(params.amount_display));
        setTab("stake");
      }
      ctx.highlight("stake-submit", "agent-clicking");
    });

    const unsubscribe = agent.subscribe((event) => {
      if (event.type !== "result") return;
      if (event.result.status === "executed") {
        setStatus(event.action + " submitted — digest " + event.result.digest);
        if (event.action === "swap") void refreshSwapQuote();
        if (event.action === "stake" || event.action === "unstake") void loadStakeBalance();
      }
    });

    function onAgentRefresh() {
      void refreshSwapQuote();
      void loadOrders();
    }
    window.addEventListener("radiant-agent-refresh", onAgentRefresh);
    return () => {
      unsubscribe();
      window.removeEventListener("radiant-agent-refresh", onAgentRefresh);
    };
  }, [loadStakeBalance, refreshSwapQuote, loadOrders]);

  useEffect(() => {
    if (tab === "stake") void loadStakeBalance();
    if (tab === "governance") void loadGovernance();
    if (tab === "orders") void loadOrders();
  }, [tab, loadGovernance, loadOrders, loadStakeBalance]);

  async function runAgentAction(action: string, params: Record<string, unknown>, target?: string) {
    const agent = typeof window !== "undefined" ? window.__radiantAgent : undefined;
    if (!agent) {
      setStatus("Agent runtime not loaded");
      return;
    }
    setBusy(true);
    setStatus(null);
    try {
      const result = await agent.execute(action, params, { animate: true, target });
      if (result.status === "approval_required") {
        setStatus("Approve the transaction in the bar above");
      }
    } catch (err) {
      setStatus(err instanceof Error ? err.message : action + " failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-lg space-y-4 p-4">
      <nav className="flex flex-wrap gap-2">
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            className={
              "rounded-full border-2 border-[var(--hero-ink)] px-3 py-1.5 text-xs font-bold " +
              (tab === item.id ? "bg-[var(--hero-ink)] text-[var(--hero-bg)]" : "bg-white")
            }
            onClick={() => setTab(item.id)}
          >
            {item.label}
          </button>
        ))}
      </nav>

      {tab === "swap" ? (
        <section className={panelClass() + " space-y-4"}>
          <h1 className="text-xl font-extrabold">Swap</h1>
          <label className="block text-sm font-semibold">
            Amount (SUI)
            <input
              data-radiant-id="amount-in"
              className="mt-1 w-full rounded-lg border-2 border-[var(--hero-ink)] px-3 py-2"
              value={swapAmount}
              onChange={(event) => setSwapAmount(event.target.value)}
            />
          </label>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="rounded-full border-2 border-[var(--hero-ink)] px-4 py-2 text-sm font-bold"
              onClick={() => void refreshSwapQuote()}
            >
              Get quote
            </button>
            <button
              type="button"
              data-radiant-id="swap-submit"
              disabled={busy}
              className="rounded-full border-2 border-[var(--hero-ink)] bg-[var(--hero-ink)] px-4 py-2 text-sm font-bold text-[var(--hero-bg)] disabled:opacity-50"
              onClick={() =>
                void runAgentAction("swap", {
                  side: "sell",
                  amount: Number(swapAmount),
                  pool_key: POOL_KEY,
                })
              }
            >
              Swap
            </button>
          </div>
          {swapQuoteLabel ? (
            <p className="text-sm font-semibold text-[var(--hero-ink)]/70">{swapQuoteLabel}</p>
          ) : null}
        </section>
      ) : null}

      {tab === "flash_loan" ? (
        <section className={panelClass() + " space-y-4"}>
          <h1 className="text-xl font-extrabold">Flash loan</h1>
          <label className="block text-sm font-semibold">
            Borrow amount
            <input
              className="mt-1 w-full rounded-lg border-2 border-[var(--hero-ink)] px-3 py-2"
              value={flashAmount}
              onChange={(event) => setFlashAmount(event.target.value)}
            />
          </label>
          <label className="block text-sm font-semibold">
            Asset
            <select
              className="mt-1 w-full rounded-lg border-2 border-[var(--hero-ink)] px-3 py-2"
              value={flashAsset}
              onChange={(event) => setFlashAsset(event.target.value as "base" | "quote")}
            >
              <option value="base">Base</option>
              <option value="quote">Quote</option>
            </select>
          </label>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="rounded-full border-2 border-[var(--hero-ink)] px-4 py-2 text-sm font-bold"
              onClick={() =>
                void flashLoanQuote({
                  pool_key: POOL_KEY,
                  borrow_amount: Number(flashAmount),
                  asset: flashAsset,
                  strategy: "round_trip",
                }).then((quote) => {
                  const feasible = quote.repay_feasible === true ? "feasible" : "not feasible";
                  setFlashQuoteLabel("Repay " + feasible);
                })
              }
            >
              Get quote
            </button>
            <button
              type="button"
              data-radiant-id="flash-loan-submit"
              disabled={busy}
              className="rounded-full border-2 border-[var(--hero-ink)] bg-[var(--hero-ink)] px-4 py-2 text-sm font-bold text-[var(--hero-bg)] disabled:opacity-50"
              onClick={() =>
                void runAgentAction("flash_loan", {
                  pool_key: POOL_KEY,
                  borrow_amount: Number(flashAmount),
                  asset: flashAsset,
                  strategy: "round_trip",
                })
              }
            >
              Execute
            </button>
          </div>
          {flashQuoteLabel ? (
            <p className="text-sm font-semibold text-[var(--hero-ink)]/70">{flashQuoteLabel}</p>
          ) : null}
        </section>
      ) : null}

      {tab === "stake" ? (
        <section className={panelClass() + " space-y-4"}>
          <h1 className="text-xl font-extrabold">Stake DEEP</h1>
          {stakeInfo ? <p className="text-sm font-semibold text-[var(--hero-ink)]/70">{stakeInfo}</p> : null}
          <label className="block text-sm font-semibold">
            Amount
            <input
              className="mt-1 w-full rounded-lg border-2 border-[var(--hero-ink)] px-3 py-2"
              value={stakeAmount}
              onChange={(event) => setStakeAmount(event.target.value)}
            />
          </label>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              data-radiant-id="stake-submit"
              disabled={busy}
              className="rounded-full border-2 border-[var(--hero-ink)] bg-[var(--hero-ink)] px-4 py-2 text-sm font-bold text-[var(--hero-bg)] disabled:opacity-50"
              onClick={() =>
                void runAgentAction("stake", {
                  amount_display: Number(stakeAmount),
                  pool_key: POOL_KEY,
                })
              }
            >
              Stake
            </button>
            <button
              type="button"
              disabled={busy}
              className="rounded-full border-2 border-[var(--hero-ink)] px-4 py-2 text-sm font-bold"
              onClick={() => void runAgentAction("unstake", { pool_key: POOL_KEY })}
            >
              Unstake all
            </button>
          </div>
        </section>
      ) : null}

      {tab === "governance" ? (
        <section className={panelClass() + " space-y-4"}>
          <h1 className="text-xl font-extrabold">Governance</h1>
          {govInfo ? <p className="text-sm font-semibold text-[var(--hero-ink)]/70">{govInfo}</p> : null}
          <label className="block text-sm font-semibold">
            Proposal description
            <input
              className="mt-1 w-full rounded-lg border-2 border-[var(--hero-ink)] px-3 py-2"
              value={proposalDesc}
              onChange={(event) => setProposalDesc(event.target.value)}
            />
          </label>
          <button
            type="button"
            disabled={busy || !proposalDesc.trim()}
            className="rounded-full border-2 border-[var(--hero-ink)] bg-[var(--hero-ink)] px-4 py-2 text-sm font-bold text-[var(--hero-bg)] disabled:opacity-50"
            onClick={() =>
              void runAgentAction("submit_proposal", {
                pool_key: POOL_KEY,
                description: proposalDesc,
              })
            }
          >
            Submit proposal
          </button>
          <label className="block text-sm font-semibold">
            Proposal ID
            <input
              className="mt-1 w-full rounded-lg border-2 border-[var(--hero-ink)] px-3 py-2"
              value={voteId}
              onChange={(event) => setVoteId(event.target.value)}
            />
          </label>
          <button
            type="button"
            disabled={busy || !voteId.trim()}
            className="rounded-full border-2 border-[var(--hero-ink)] px-4 py-2 text-sm font-bold"
            onClick={() =>
              void runAgentAction("vote", {
                pool_key: POOL_KEY,
                proposal_id: voteId,
                vote: true,
              })
            }
          >
            Vote yes
          </button>
        </section>
      ) : null}

      {tab === "orders" ? (
        <section className={panelClass() + " space-y-4"}>
          <h1 className="text-xl font-extrabold">Open orders</h1>
          <button
            type="button"
            className="rounded-full border-2 border-[var(--hero-ink)] px-4 py-2 text-sm font-bold"
            onClick={() => void loadOrders()}
          >
            Refresh
          </button>
          {orders.length === 0 ? (
            <p className="text-sm font-semibold text-[var(--hero-ink)]/70">No open orders</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {orders.map((order) => (
                <li
                  key={String(order.order_id ?? order.client_order_id ?? Math.random())}
                  className="rounded-lg border border-[var(--hero-ink)]/20 px-3 py-2"
                >
                  {String(order.side ?? (order.is_bid ? "buy" : "sell"))} · qty{" "}
                  {String(order.remaining_quantity ?? order.quantity ?? "?")} @{" "}
                  {String(order.price ?? "?")}
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}

      {status ? <p className="text-sm font-semibold text-[var(--hero-violet)]">{status}</p> : null}
    </div>
  );
}
`;
