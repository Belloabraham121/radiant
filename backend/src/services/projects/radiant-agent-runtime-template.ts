/** Template files for generated app agent runtime (Phase 4 + in-app approval v2). */

export const RADIANT_AGENT_RUNTIME_VERSION = 5;

export const RADIANT_AGENT_RUNTIME_TS = `/** Agent UI runtime — register local handlers + execute via radiant-client. Template v${RADIANT_AGENT_RUNTIME_VERSION}. */
import {
  approveAgentTransaction,
  executeAction,
  isApprovalRequired,
  rejectAgentTransaction,
  type AppActionResult,
} from "./radiant-client";

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
  setNativeValue(el, value);
}

function setNativeValue(el: Element, value: unknown) {
  if (
    el instanceof HTMLInputElement ||
    el instanceof HTMLTextAreaElement ||
    el instanceof HTMLSelectElement
  ) {
    const proto =
      el instanceof HTMLTextAreaElement
        ? HTMLTextAreaElement.prototype
        : el instanceof HTMLSelectElement
          ? HTMLSelectElement.prototype
          : HTMLInputElement.prototype;
    const descriptor = Object.getOwnPropertyDescriptor(proto, "value");
    if (descriptor?.set) {
      descriptor.set.call(el, String(value));
    } else {
      el.value = String(value);
    }
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  }
}

function fillSwapFields(params: Record<string, unknown>) {
  const amount = params.amount ?? params.amount_display;
  const side = params.side;
  if (amount != null) {
    setFieldValue("amount-in", amount);
    setFieldValue("amount", amount);
    const amountEl = document.querySelector(
      '[data-radiant-id="amount-in"], [data-radiant-id="amount"], input[type="number"], input[name*="amount" i]',
    );
    if (amountEl) setNativeValue(amountEl, amount);
  }
  if (side != null) {
    setFieldValue("side", side);
    const sideEl = document.querySelector(
      '[data-radiant-id="side"], select[name*="side" i]',
    );
    if (sideEl) setNativeValue(sideEl, side);
  }
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("radiant-agent-swap", { detail: params }));
  }
}

function defaultSwapAgentHandler(
  params: Record<string, unknown>,
  ctx: RadiantAgentContext,
) {
  fillSwapFields(params);
  ctx.highlight("amount-in");
  ctx.highlight("swap-submit", "agent-clicking");
}

handlers.set("swap", defaultSwapAgentHandler);

function createContext(animate: boolean): RadiantAgentContext {
  return {
    animate,
    highlight: (targetId, className) => highlightTarget(targetId, className ?? "agent-focused"),
  };
}

type PendingTx = {
  id: string;
  chain_id: string;
  action: string;
  params: Record<string, unknown>;
  summary: string;
  amount_display: string;
  quote_expires_at?: string | null;
};

function approvalTitle(action: string, pending: PendingTx): string {
  const key = action || pending.action;
  if (key === "swap" || key === "deepbook_swap") return "Confirm swap";
  if (key === "flash_loan" || key === "deepbook_flash_loan") return "Confirm flash loan";
  if (key === "stake" || key === "deepbook_stake") return "Confirm stake";
  if (key === "unstake" || key === "deepbook_unstake") return "Confirm unstake";
  if (key === "deepbook_submit_proposal") return "Confirm proposal";
  if (key === "deepbook_vote") return "Confirm vote";
  if (key.includes("order")) return "Confirm order";
  if (key.includes("cancel")) return "Confirm cancel";
  return "Confirm transaction";
}

function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return minutes > 0 ? minutes + "m " + String(seconds).padStart(2, "0") + "s" : seconds + "s";
}

function notifyParentApprovalResolved(
  pendingId: string,
  status: "executed" | "rejected" | "error",
  extra?: { digest?: string; errorMessage?: string },
): void {
  if (typeof window === "undefined") return;
  try {
    window.parent.postMessage(
      {
        type: "radiant-tx-approval-resolved",
        pendingId,
        status,
        digest: extra?.digest,
        errorMessage: extra?.errorMessage,
      },
      "*",
    );
  } catch {
    // ignore
  }
}

function notifyParentExecuteResult(
  action: string,
  result: AppActionResult,
): void {
  if (typeof window === "undefined") return;
  try {
    window.parent.postMessage(
      {
        type: "radiant-preview-execute-result",
        action,
        status: result.status,
        digest: result.status === "executed" ? result.digest : undefined,
        message: result.status === "error" ? result.error.message : undefined,
        pending:
          result.status === "approval_required"
            ? result.pending
            : undefined,
      },
      "*",
    );
  } catch {
    // ignore
  }
}

function showInAppApprovalModal(
  action: string,
  result: Extract<AppActionResult, { status: "approval_required" }>,
): Promise<AppActionResult> {
  return new Promise((resolve) => {
    if (typeof document === "undefined") {
      resolve(result);
      return;
    }

    const pending = result.pending as PendingTx;
    if (!pending?.id) {
      resolve(result);
      return;
    }

    const overlay = document.createElement("div");
    overlay.className = "radiant-tx-approval-overlay";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");

    const card = document.createElement("div");
    card.className = "radiant-tx-approval-card";

    const title = document.createElement("h2");
    title.className = "radiant-tx-approval-title";
    title.textContent = approvalTitle(action, pending);

    const subtitle = document.createElement("p");
    subtitle.className = "radiant-tx-approval-subtitle";
    subtitle.textContent = pending.summary || "Review the details, then approve to sign and send.";

    const amount = document.createElement("p");
    amount.className = "radiant-tx-approval-amount";
    amount.textContent = pending.amount_display;

    const meta = document.createElement("p");
    meta.className = "radiant-tx-approval-meta";
    meta.textContent = pending.chain_id + " · " + (action || pending.action);

    const quoteNote = document.createElement("p");
    quoteNote.className = "radiant-tx-approval-quote";
    quoteNote.hidden = true;

    const errorEl = document.createElement("p");
    errorEl.className = "radiant-tx-approval-error";
    errorEl.hidden = true;

    const actions = document.createElement("div");
    actions.className = "radiant-tx-approval-actions";

    const approveBtn = document.createElement("button");
    approveBtn.type = "button";
    approveBtn.className = "radiant-tx-approval-approve";
    approveBtn.textContent = "Approve & send";

    const cancelBtn = document.createElement("button");
    cancelBtn.type = "button";
    cancelBtn.className = "radiant-tx-approval-cancel";
    cancelBtn.textContent = "Cancel";

    actions.append(approveBtn, cancelBtn);
    card.append(title, subtitle, amount, meta, quoteNote, errorEl, actions);
    overlay.append(card);
    document.body.append(overlay);

    let quoteTimer: ReturnType<typeof setInterval> | null = null;
    let quoteExpired = false;

    function cleanup() {
      if (quoteTimer) clearInterval(quoteTimer);
      overlay.remove();
    }

    const isSwap = action === "swap" || pending.action === "swap" || pending.action === "deepbook_swap";
    if (isSwap && pending.quote_expires_at) {
      const expiresAt = Date.parse(pending.quote_expires_at);
      if (Number.isFinite(expiresAt)) {
        quoteNote.hidden = false;
        const tick = () => {
          const remaining = expiresAt - Date.now();
          if (remaining <= 0) {
            quoteExpired = true;
            quoteNote.textContent = "Quote expired — cancel and get a fresh quote.";
            quoteNote.classList.add("radiant-tx-approval-quote-expired");
            approveBtn.disabled = true;
            if (quoteTimer) clearInterval(quoteTimer);
            return;
          }
          quoteNote.textContent = "Quote valid for " + formatCountdown(remaining);
        };
        tick();
        quoteTimer = setInterval(tick, 1000);
      }
    }

    let busy = false;

    async function onApprove() {
      if (busy || quoteExpired) return;
      busy = true;
      approveBtn.disabled = true;
      cancelBtn.disabled = true;
      approveBtn.textContent = "Sending…";
      errorEl.hidden = true;

      try {
        const approved = await approveAgentTransaction(pending.id);
        if (approved.status === "executed") {
          cleanup();
          const executed: AppActionResult = {
            status: "executed",
            action,
            digest: approved.digest,
            explorer_url: approved.explorer_url,
            agent_transaction_id: approved.agent_transaction_id,
            result: approved.result,
          };
          notifyParentApprovalResolved(pending.id, "executed", { digest: approved.digest });
          resolve(executed);
          return;
        }
        errorEl.textContent = approved.error.message;
        errorEl.hidden = false;
        notifyParentApprovalResolved(pending.id, "error", { errorMessage: approved.error.message });
      } catch (err) {
        const message = err instanceof Error ? err.message : "Approval failed";
        errorEl.textContent = message;
        errorEl.hidden = false;
        notifyParentApprovalResolved(pending.id, "error", { errorMessage: message });
      } finally {
        busy = false;
        if (!quoteExpired) {
          approveBtn.disabled = false;
          cancelBtn.disabled = false;
          approveBtn.textContent = "Approve & send";
        }
      }
    }

    async function onCancel() {
      if (busy) return;
      busy = true;
      approveBtn.disabled = true;
      cancelBtn.disabled = true;
      try {
        await rejectAgentTransaction(pending.id);
      } catch {
        // Best-effort reject — still close the modal.
      }
      cleanup();
      notifyParentApprovalResolved(pending.id, "rejected");
      resolve({
        status: "error",
        action,
        error: { code: "REJECTED", message: "Transaction cancelled" },
      });
    }

    approveBtn.addEventListener("click", () => void onApprove());
    cancelBtn.addEventListener("click", () => void onCancel());
    overlay.addEventListener("click", (event) => {
      if (event.target === overlay) void onCancel();
    });
  });
}

async function resolveApprovalIfNeeded(action: string, result: AppActionResult): Promise<AppActionResult> {
  if (!isApprovalRequired(result)) {
    return result;
  }
  return showInAppApprovalModal(action, result);
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

    if (action && data.step === "execute_in_app" && params) {
      void radiantAgent
        .execute(action, params, { animate: true })
        .then((result) => {
          emit({ type: "result", action, result });
          notifyParentExecuteResult(action, result);
          if (result.status === "executed" && typeof window !== "undefined") {
            window.dispatchEvent(new CustomEvent("radiant-agent-refresh"));
          }
        })
        .catch((err) => {
          const message = err instanceof Error ? err.message : "Action failed in preview";
          const failed: AppActionResult = {
            status: "error",
            action,
            error: { code: "EXECUTE_FAILED", message },
          };
          emit({ type: "result", action, result: failed });
          notifyParentExecuteResult(action, failed);
        });
      return;
    }

    if (action && data.step === "approval_required" && data.pending && typeof data.pending === "object") {
      const pending = data.pending as Record<string, unknown>;
      void resolveApprovalIfNeeded(action, {
        status: "approval_required",
        action,
        agent_transaction_id: String(pending.id ?? ""),
        pending,
      }).then((result) => {
        emit({ type: "result", action, result });
        if (result.status === "executed" && typeof window !== "undefined") {
          window.dispatchEvent(new CustomEvent("radiant-agent-refresh"));
        }
      });
      return;
    }

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
    const animate = Boolean(opts.animate);
    if (animate) {
      activeCount += 1;
      emit({ type: "active", active: true });
    }
    emit({ type: "executing", action, params });
    try {
      if (animate) {
        const handler = handlers.get(action);
        if (handler) {
          await handler(params, createContext(true));
        }
      }
      let result = await executeAction(action, params);
      result = await resolveApprovalIfNeeded(action, result);
      emit({ type: "result", action, result });
      return result;
    } finally {
      if (animate) {
        activeCount = Math.max(0, activeCount - 1);
        if (activeCount === 0) {
          emit({ type: "active", active: false });
        }
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

.radiant-tx-approval-overlay {
  position: fixed;
  inset: 0;
  z-index: 100;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1rem;
  background: rgba(26, 26, 26, 0.45);
  backdrop-filter: blur(2px);
}

.radiant-tx-approval-card {
  width: min(100%, 24rem);
  border-radius: 1.25rem;
  border: 2px solid var(--hero-ink);
  background: white;
  padding: 1.25rem;
  box-shadow: 4px 4px 0 var(--hero-ink);
}

.radiant-tx-approval-title {
  margin: 0;
  font-size: 1.125rem;
  font-weight: 800;
  color: var(--hero-ink);
}

.radiant-tx-approval-subtitle {
  margin: 0.35rem 0 0;
  font-size: 0.75rem;
  font-weight: 600;
  color: rgba(26, 26, 26, 0.55);
}

.radiant-tx-approval-amount {
  margin: 1rem 0 0;
  font-size: 1.5rem;
  font-weight: 800;
  color: var(--hero-ink);
}

.radiant-tx-approval-meta {
  margin: 0.25rem 0 0;
  font-family: ui-monospace, monospace;
  font-size: 0.625rem;
  font-weight: 600;
  color: rgba(26, 26, 26, 0.45);
}

.radiant-tx-approval-quote {
  margin: 0.75rem 0 0;
  font-size: 0.625rem;
  font-weight: 600;
  color: var(--hero-blue, #3b82f6);
}

.radiant-tx-approval-quote-expired {
  color: var(--hero-coral, #ff5d46);
}

.radiant-tx-approval-error {
  margin: 0.75rem 0 0;
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--hero-coral, #ff5d46);
}

.radiant-tx-approval-actions {
  display: flex;
  gap: 0.5rem;
  margin-top: 1rem;
}

.radiant-tx-approval-approve,
.radiant-tx-approval-cancel {
  flex: 1;
  border-radius: 9999px;
  border: 2px solid var(--hero-ink);
  padding: 0.625rem 1rem;
  font-size: 0.875rem;
  font-weight: 700;
  cursor: pointer;
}

.radiant-tx-approval-approve {
  background: var(--hero-ink);
  color: var(--hero-bg);
  box-shadow: 3px 3px 0 var(--hero-coral, #ff5d46);
}

.radiant-tx-approval-cancel {
  background: white;
  color: var(--hero-ink);
  box-shadow: 3px 3px 0 var(--hero-ink);
}

.radiant-tx-approval-approve:disabled,
.radiant-tx-approval-cancel:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
`;
