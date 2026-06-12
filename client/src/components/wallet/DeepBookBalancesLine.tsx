"use client";

import { useEffect } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import { useDeepBookBalances } from "@/hooks/useDeepBookBalances";

function formatBalance(amount: number): string {
  if (amount === 0) return "0";
  return amount.toLocaleString(undefined, { maximumFractionDigits: 6 });
}

type DeepBookBalancesLineProps = {
  enabled?: boolean;
  walletSuiBalance?: number | null;
};

export function DeepBookBalancesLine({
  enabled = true,
  walletSuiBalance = null,
}: DeepBookBalancesLineProps) {
  const { data, loading, error, reload, loadIfNeeded } = useDeepBookBalances({ enabled });

  useEffect(() => {
    if (enabled) {
      void loadIfNeeded();
    }
  }, [enabled, loadIfNeeded]);

  const nonZeroBalances =
    data?.balances?.balances.filter((entry) => entry.balance_display > 0) ?? [];

  const suiManager = data?.balances?.balances.find((entry) => entry.coin_key === "SUI");

  return (
    <div className="mt-3 rounded-2xl border-2 border-[var(--hero-ink)]/15 bg-[var(--hero-bg)] px-3 py-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--hero-ink)]/45">
          DeepBook balance manager
        </p>
        <button
          type="button"
          disabled={!enabled || loading}
          onClick={() => void reload()}
          className="inline-flex items-center gap-1 rounded-full border border-[var(--hero-ink)]/20 bg-white px-2 py-0.5 text-[10px] font-bold text-[var(--hero-ink)]/70 disabled:opacity-50"
        >
          {loading ? <Loader2 className="size-3 animate-spin" /> : <RefreshCw className="size-3" />}
          Refresh
        </button>
      </div>

      {error ? (
        <p className="mt-2 text-xs font-medium text-[var(--hero-coral)]">{error}</p>
      ) : loading && !data ? (
        <p className="mt-2 text-xs font-medium text-[var(--hero-ink)]/45">Loading manager balances…</p>
      ) : data && !data.manager.provisioned ? (
        <p className="mt-2 text-xs font-medium text-[var(--hero-ink)]/55">
          Not set up yet. Your agent will create a manager on the first DeepBook trade or deposit.
        </p>
      ) : nonZeroBalances.length === 0 ? (
        <p className="mt-2 text-xs font-medium text-[var(--hero-ink)]/55">
          Manager is ready — no deposited trading funds yet.
        </p>
      ) : (
        <div className="mt-2 space-y-1">
          {walletSuiBalance !== null && suiManager ? (
            <p className="text-xs font-medium text-[var(--hero-ink)]/60">
              Wallet {formatBalance(walletSuiBalance)} SUI · Manager{" "}
              {formatBalance(suiManager.balance_display)} SUI
            </p>
          ) : null}
          <p className="text-xs font-semibold text-[var(--hero-ink)]/75">
            {nonZeroBalances
              .map((entry) => `${formatBalance(entry.balance_display)} ${entry.coin_key}`)
              .join(" · ")}
          </p>
        </div>
      )}
    </div>
  );
}
