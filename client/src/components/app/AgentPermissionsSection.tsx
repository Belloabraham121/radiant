"use client";

import { usePrivy } from "@privy-io/react-auth";
import { Loader2 } from "lucide-react";
import { useState } from "react";
import { useAgentPermissions } from "@/hooks/useAgentPermissions";

function PermissionToggle({
  label,
  detail,
  on,
  disabled,
  onToggle,
}: {
  label: string;
  detail: string;
  on: boolean;
  disabled?: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onToggle}
      className="flex w-full items-center justify-between gap-4 rounded-2xl border-2 border-[var(--hero-ink)] bg-white px-5 py-4 text-left shadow-[3px_3px_0_var(--hero-ink)] transition-transform hover:-translate-y-0.5 disabled:opacity-60"
    >
      <span>
        <span className="block text-sm font-bold">{label}</span>
        <span className="block text-xs font-medium text-[var(--hero-ink)]/50">{detail}</span>
      </span>
      <span
        className={`relative h-7 w-12 shrink-0 rounded-full border-2 border-[var(--hero-ink)] transition-colors ${
          on ? "bg-[var(--hero-mint)]" : "bg-[var(--hero-ink)]/10"
        }`}
      >
        <span
          className={`absolute top-0.5 size-5 rounded-full border-2 border-[var(--hero-ink)] bg-white transition-all ${
            on ? "left-[22px]" : "left-0.5"
          }`}
        />
      </span>
    </button>
  );
}

export function AgentPermissionsSection() {
  const { authenticated } = usePrivy();
  const {
    permissions,
    loading,
    saving,
    error,
    setAutoApproveEnabled,
    setAutoApproveMaxSui,
    setAllowFlashLoans,
    setAutoApproveFlashLoans,
  } = useAgentPermissions(authenticated);
  const serverMaxSui = String(permissions.auto_approve_max_sui);
  const [draftMaxSui, setDraftMaxSui] = useState(serverMaxSui);
  const [editingMaxSui, setEditingMaxSui] = useState(false);
  const thresholdInputValue = editingMaxSui ? draftMaxSui : serverMaxSui;

  const thresholdLabel = permissions.auto_approve_enabled
    ? `Swaps and transfers up to ${permissions.auto_approve_max_sui} SUI go through instantly. Larger amounts pause for your approval.`
    : "Every swap and transfer will pause for your approval in chat before signing.";

  return (
    <section data-settings-block className="mt-10 pb-10">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-sm font-bold uppercase tracking-[0.2em] text-[var(--hero-ink)]/40">
          Agent permissions
        </h2>
        {saving ? (
          <span className="flex items-center gap-1.5 text-xs font-semibold text-[var(--hero-ink)]/45">
            <Loader2 className="size-3.5 animate-spin" />
            Saving…
          </span>
        ) : null}
      </div>

      {error ? (
        <p role="alert" className="mb-3 text-sm font-semibold text-[var(--hero-coral)]">
          {error}
        </p>
      ) : null}

      <div className="flex flex-col gap-3">
        <PermissionToggle
          label="Auto-approve transactions"
          detail={loading ? "Loading…" : thresholdLabel}
          on={permissions.auto_approve_enabled}
          disabled={loading || saving}
          onToggle={() => void setAutoApproveEnabled(!permissions.auto_approve_enabled)}
        />

        {permissions.auto_approve_enabled ? (
          <div className="rounded-2xl border-2 border-dashed border-[var(--hero-ink)]/25 bg-[var(--hero-bg)] px-5 py-4">
            <label
              htmlFor="auto-approve-max-sui"
              className="block text-xs font-bold uppercase tracking-[0.12em] text-[var(--hero-ink)]/45"
            >
              Auto-approve threshold (SUI)
            </label>
            <div className="mt-2 flex items-center gap-3">
              <span className="text-sm font-semibold text-[var(--hero-ink)]/55">Under</span>
              <input
                id="auto-approve-max-sui"
                type="number"
                min={0.01}
                max={1000000}
                step={0.01}
                disabled={loading || saving}
                value={thresholdInputValue}
                onFocus={() => {
                  setEditingMaxSui(true);
                  setDraftMaxSui(serverMaxSui);
                }}
                onChange={(event) => setDraftMaxSui(event.target.value)}
                onBlur={() => {
                  setEditingMaxSui(false);
                  const next = Number(draftMaxSui);
                  if (!Number.isFinite(next) || next <= 0) {
                    setDraftMaxSui(serverMaxSui);
                    return;
                  }
                  if (next !== permissions.auto_approve_max_sui) {
                    void setAutoApproveMaxSui(next);
                  }
                }}
                className="w-28 rounded-xl border-2 border-[var(--hero-ink)] bg-white px-3 py-2 font-mono text-sm font-bold shadow-[2px_2px_0_var(--hero-ink)] focus:outline-none disabled:opacity-60"
              />
              <span className="text-sm font-semibold text-[var(--hero-ink)]/55">SUI</span>
            </div>
            <p className="mt-2 text-xs font-medium text-[var(--hero-ink)]/45">
              Set any amount — e.g. 30, 100. Balance manager setup, deposits, and withdrawals always ask first.
            </p>
          </div>
        ) : null}

        <PermissionToggle
          label="Allow flash loans"
          detail={
            loading
              ? "Loading…"
              : permissions.allow_flash_loans
                ? permissions.auto_approve_flash_loans
                  ? "Flash loans enabled. Bundled routes that repay from swap output may skip the approval dialog."
                  : "Advanced DeepBook flash loans are enabled. Every flash loan shows an approval dialog."
                : "Flash loans stay disabled. The agent cannot initiate deepbook_flash_loan until you turn this on."
          }
          on={permissions.allow_flash_loans}
          disabled={loading || saving}
          onToggle={() => void setAllowFlashLoans(!permissions.allow_flash_loans)}
        />

        {permissions.allow_flash_loans ? (
          <PermissionToggle
            label="Auto-approve flash loans"
            detail="Execute flash loan bundles without a confirmation dialog. Atomic loans only spend gas if the transaction fails. Swaps that repay from your wallet still ask for approval."
            on={permissions.auto_approve_flash_loans}
            disabled={loading || saving}
            onToggle={() => void setAutoApproveFlashLoans(!permissions.auto_approve_flash_loans)}
          />
        ) : null}
      </div>
    </section>
  );
}
