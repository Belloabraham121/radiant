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
    }
    if (data.active === true) {
      emit({ type: "active", active: true });
    }
    if (data.active === false) {
      emit({ type: "active", active: false });
    }
    const action = typeof data.action === "string" ? data.action : null;
    if (action && data.step === "executing") {
      const params =
        data.params && typeof data.params === "object"
          ? (data.params as Record<string, unknown>)
          : {};
      emit({ type: "executing", action, params });
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

import { useEffect, useState } from "react";
import { swapQuote } from "../lib/radiant-client";

export default function SwapForm() {
  const [amount, setAmount] = useState("1");
  const [side] = useState<"buy" | "sell">("sell");
  const [quoteLabel, setQuoteLabel] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const agent = typeof window !== "undefined" ? window.__radiantAgent : undefined;
    if (!agent) return;
    agent.register("swap", async (_params, ctx) => {
      ctx.highlight("swap-submit", "agent-clicking");
    });
  }, []);

  async function handleQuote() {
    setStatus(null);
    const parsed = Number(amount);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      setStatus("Enter a valid amount");
      return;
    }
    const quote = await swapQuote({ side, amount: parsed, pool_key: "SUI_USDC" });
    setQuoteLabel("~" + quote.output_amount_display + " " + quote.output_coin);
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
