"use client";

import { usePrivy } from "@privy-io/react-auth";
import { ChevronDown, Folder, Loader2 } from "lucide-react";
import { useState } from "react";
import { useAgentPermissions } from "@/hooks/useAgentPermissions";
import type { AgentPermissions } from "@/lib/agent-permissions-api";

const PERMISSIONS_SUMMARY_PLACEHOLDER =
  "Auto-approve, flash loans, governance, and more";

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
      className="flex w-full items-center justify-between gap-4 rounded-2xl border-2 border-[var(--hero-ink)] bg-white px-5 py-4 text-left shadow-[3px_3px_0_var(--hero-ink)] transition-transform hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:translate-y-0"
    >
      <span>
        <span className="block text-sm font-bold">{label}</span>
        <span className="block text-xs font-medium text-[var(--hero-ink)]/50">{detail}</span>
      </span>
      <span
        className={`relative h-7 w-12 shrink-0 rounded-full border-2 border-[var(--hero-ink)] transition-colors ${
          on ? "bg-[var(--hero-mint)]" : "bg-[var(--hero-ink)]/10"
        } ${disabled ? "opacity-60" : ""}`}
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

function permissionsSummary(permissions: AgentPermissions): string {
  const parts: string[] = [];
  parts.push(
    permissions.auto_approve_enabled
      ? `Auto-approve under $${permissions.auto_approve_max_usd}`
      : "Manual approval for all txs",
  );
  if (permissions.allow_flash_loans) {
    parts.push(
      permissions.auto_approve_flash_loans ? "Flash loans auto-approved" : "Flash loans on",
    );
  }
  if (permissions.allow_governance) parts.push("Governance on");
  if (permissions.allow_margin) parts.push("Margin on");
  if (permissions.allow_predict) parts.push("Predict on");

  return parts.join(" · ");
}

function flashLoansDetail(permissions: AgentPermissions): string {
  if (permissions.allow_flash_loans) {
    return permissions.auto_approve_flash_loans
      ? "Flash loans enabled. Bundled routes that repay from swap output may skip the approval dialog."
      : "Advanced DeepBook flash loans are enabled. Every flash loan shows an approval dialog.";
  }
  return "Flash loans stay disabled. The agent cannot initiate deepbook_flash_loan until you turn this on.";
}

function governanceDetail(permissions: AgentPermissions): string {
  return permissions.allow_governance
    ? "The agent can submit fee proposals and vote on DeepBook pools. Every governance transaction shows an approval dialog."
    : "Governance stays disabled. The agent cannot submit proposals or vote until you turn this on.";
}

function marginDetail(permissions: AgentPermissions): string {
  return permissions.allow_margin
    ? "Leveraged trading enabled. The agent can deposit collateral, borrow from margin pools, and place leveraged orders. Every margin transaction shows an approval dialog."
    : "Margin trading stays disabled. The agent cannot borrow or place leveraged orders until you turn this on.";
}

function predictDetail(permissions: AgentPermissions): string {
  return permissions.allow_predict
    ? "Prediction markets enabled. The agent can mint and redeem binary/range positions on DeepBook Predict (testnet). Every prediction shows an approval dialog."
    : "Prediction markets stay disabled. The agent cannot mint or redeem positions until you turn this on.";
}

export function AgentPermissionsSection() {
  const [open, setOpen] = useState(false);
  const { authenticated } = usePrivy();
  const {
    permissions,
    loaded,
    saving,
    controlsDisabled,
    error,
    setAutoApproveEnabled,
    setAutoApproveMaxUsd,
    setAllowFlashLoans,
    setAutoApproveFlashLoans,
    setAllowGovernance,
    setAllowMargin,
    setAllowPredict,
  } = useAgentPermissions(authenticated, open);

  const serverMaxUsd = String(permissions.auto_approve_max_usd);
  const [draftMaxUsd, setDraftMaxUsd] = useState(serverMaxUsd);
  const [editingMaxUsd, setEditingMaxUsd] = useState(false);
  const thresholdInputValue = editingMaxUsd ? draftMaxUsd : serverMaxUsd;

  const thresholdLabel = permissions.auto_approve_enabled
    ? `Swaps and transfers worth up to $${permissions.auto_approve_max_usd} go through instantly on any chain. Larger amounts pause for your approval.`
    : "Every swap and transfer will pause for your approval in chat before signing.";

  const summaryText = loaded
    ? permissionsSummary(permissions)
    : PERMISSIONS_SUMMARY_PLACEHOLDER;

  return (
    <section data-settings-block className="mt-10 pb-10">
      <div className="rounded-3xl border-2 border-[var(--hero-ink)] bg-white shadow-[5px_5px_0_var(--hero-ink)]">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left"
        >
          <span className="flex min-w-0 items-center gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl border-2 border-[var(--hero-ink)] bg-[var(--hero-violet)]/10">
              <Folder className="size-5 text-[var(--hero-violet)]" strokeWidth={2.5} />
            </span>
            <span className="min-w-0">
              <span className="flex flex-wrap items-center gap-2">
                <span className="font-heading text-base font-extrabold tracking-tight">
                  Agent permissions
                </span>
                {saving ? (
                  <span className="flex items-center gap-1 rounded-full border-2 border-[var(--hero-ink)] bg-white px-2.5 py-0.5 text-[10px] font-bold text-[var(--hero-ink)]/55">
                    <Loader2 className="size-3 animate-spin" />
                    Saving…
                  </span>
                ) : null}
              </span>
              <span className="mt-0.5 block truncate text-xs font-medium text-[var(--hero-ink)]/50">
                {summaryText}
              </span>
            </span>
          </span>
          <ChevronDown
            className={`size-5 shrink-0 text-[var(--hero-ink)]/40 transition-transform ${
              open ? "rotate-180" : ""
            }`}
            strokeWidth={2.5}
          />
        </button>

        {open ? (
          <div
            className="border-t-2 border-[var(--hero-ink)]/10 px-5 pb-5 pt-4"
            aria-busy={controlsDisabled && !saving}
          >
            <p className="mb-5 text-sm font-medium leading-relaxed text-[var(--hero-ink)]/55">
              Control how much freedom your agent has — auto-approvals, flash loans,
              governance, margin trading, and prediction markets all live here.
            </p>

            {error ? (
              <p role="alert" className="mb-3 text-sm font-semibold text-[var(--hero-coral)]">
                {error}
              </p>
            ) : null}

            <div className="flex flex-col gap-3">
              <PermissionToggle
                label="Auto-approve transactions"
                detail={thresholdLabel}
                on={permissions.auto_approve_enabled}
                disabled={controlsDisabled}
                onToggle={() => void setAutoApproveEnabled(!permissions.auto_approve_enabled)}
              />

              {permissions.auto_approve_enabled ? (
                <div
                  className={`rounded-2xl border-2 border-dashed border-[var(--hero-ink)]/25 bg-[var(--hero-bg)] px-5 py-4 ${
                    controlsDisabled ? "opacity-45" : ""
                  }`}
                >
                  <label
                    htmlFor="auto-approve-max-usd"
                    className="block text-xs font-bold uppercase tracking-[0.12em] text-[var(--hero-ink)]/45"
                  >
                    Auto-approve threshold (USD)
                  </label>
                  <div className="mt-2 flex items-center gap-3">
                    <span className="text-sm font-semibold text-[var(--hero-ink)]/55">Under</span>
                    <input
                      id="auto-approve-max-usd"
                      type="number"
                      min={0.01}
                      max={1000000}
                      step={0.01}
                      disabled={controlsDisabled}
                      value={thresholdInputValue}
                      onFocus={() => {
                        setEditingMaxUsd(true);
                        setDraftMaxUsd(serverMaxUsd);
                      }}
                      onChange={(event) => setDraftMaxUsd(event.target.value)}
                      onBlur={() => {
                        setEditingMaxUsd(false);
                        const next = Number(draftMaxUsd);
                        if (!Number.isFinite(next) || next <= 0) {
                          setDraftMaxUsd(serverMaxUsd);
                          return;
                        }
                        if (next !== permissions.auto_approve_max_usd) {
                          void setAutoApproveMaxUsd(next);
                        }
                      }}
                      className="w-28 rounded-xl border-2 border-[var(--hero-ink)] bg-white px-3 py-2 font-mono text-sm font-bold shadow-[2px_2px_0_var(--hero-ink)] focus:outline-none disabled:cursor-not-allowed disabled:opacity-60"
                    />
                    <span className="text-sm font-semibold text-[var(--hero-ink)]/55">USD</span>
                  </div>
                  <p className="mt-2 text-xs font-medium text-[var(--hero-ink)]/45">
                    Applies across all chains — e.g. $10, $30, $100. Balance manager setup,
                    deposits, and withdrawals always ask first.
                  </p>
                </div>
              ) : null}

              <PermissionToggle
                label="Allow flash loans"
                detail={flashLoansDetail(permissions)}
                on={permissions.allow_flash_loans}
                disabled={controlsDisabled}
                onToggle={() => void setAllowFlashLoans(!permissions.allow_flash_loans)}
              />

              {permissions.allow_flash_loans ? (
                <PermissionToggle
                  label="Auto-approve flash loans"
                  detail="Execute flash loan bundles without a confirmation dialog. Atomic loans only spend gas if the transaction fails. Swaps that repay from your wallet still ask for approval."
                  on={permissions.auto_approve_flash_loans}
                  disabled={controlsDisabled}
                  onToggle={() =>
                    void setAutoApproveFlashLoans(!permissions.auto_approve_flash_loans)
                  }
                />
              ) : null}

              <PermissionToggle
                label="Allow governance actions"
                detail={governanceDetail(permissions)}
                on={permissions.allow_governance}
                disabled={controlsDisabled}
                onToggle={() => void setAllowGovernance(!permissions.allow_governance)}
              />

              <PermissionToggle
                label="Allow margin trading"
                detail={marginDetail(permissions)}
                on={permissions.allow_margin}
                disabled={controlsDisabled}
                onToggle={() => void setAllowMargin(!permissions.allow_margin)}
              />

              <PermissionToggle
                label="Allow prediction markets"
                detail={predictDetail(permissions)}
                on={permissions.allow_predict}
                disabled={controlsDisabled}
                onToggle={() => void setAllowPredict(!permissions.allow_predict)}
              />
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}
