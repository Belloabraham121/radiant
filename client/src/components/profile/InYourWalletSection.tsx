"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronDown, RefreshCw, Wallet } from "lucide-react";
import { useAgentWallet } from "@/components/wallet/AgentWalletProvider";
import { useProfileWalletData } from "@/hooks/useProfileWalletData";
import { useWalletAssets } from "@/hooks/useWalletAssets";
import type { AgentChainId } from "@/lib/agent-chains";
import { getChainMeta, getEvmDefaultChainId } from "@/lib/chain-meta";
import type { WalletAssetRow } from "@/lib/wallet-assets-api";

const ASSET_ACCENT: Record<string, string> = {
  SUI: "var(--hero-blue)",
  USDC: "var(--hero-mint)",
  USDT: "var(--hero-coral)",
  DEEP: "var(--hero-violet)",
  WAL: "var(--hero-amber)",
  ETH: "var(--hero-ink)",
  SOL: "var(--hero-violet)",
};

function formatBalance(amount: number, decimals: number): string {
  if (amount === 0) return "0";
  const maxFrac = Math.min(decimals, 6);
  return amount.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: maxFrac,
  });
}

function sortAssets(assets: WalletAssetRow[]): WalletAssetRow[] {
  return [...assets].sort((a, b) => {
    const aNonZero = a.balance_atomic !== "0";
    const bNonZero = b.balance_atomic !== "0";
    if (aNonZero !== bNonZero) return aNonZero ? -1 : 1;
    return a.symbol.localeCompare(b.symbol);
  });
}

function collapsedSummary(assets: WalletAssetRow[]): string {
  const nonZero = assets.filter((a) => a.balance_atomic !== "0");
  if (nonZero.length === 0) return "No assets yet";

  const top = nonZero
    .slice(0, 2)
    .map((a) => `${formatBalance(a.balance_display, a.decimals)} ${a.symbol}`);
  return top.join(", ");
}

function AssetRow({ asset }: { asset: WalletAssetRow }) {
  const accent = ASSET_ACCENT[asset.symbol] ?? "var(--hero-ink)";
  const isZero = asset.balance_atomic === "0";

  return (
    <div
      className={`flex items-center gap-3 rounded-2xl border-2 px-4 py-3 ${
        isZero
          ? "border-[var(--hero-ink)]/10 bg-[var(--hero-bg)]"
          : "border-[var(--hero-ink)]/20 bg-white"
      }`}
    >
      <span
        className="flex size-10 shrink-0 items-center justify-center rounded-xl border-2 border-[var(--hero-ink)] font-heading text-sm font-extrabold text-white"
        style={{ backgroundColor: accent }}
      >
        {asset.symbol.slice(0, 3)}
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-heading text-sm font-extrabold tracking-tight">{asset.symbol}</p>
        <p className="truncate text-xs font-medium text-[var(--hero-ink)]/50">{asset.name}</p>
      </div>
      <div className="text-right">
        <p className="font-mono text-sm font-bold">
          {formatBalance(asset.balance_display, asset.decimals)}
        </p>
        {asset.usd_value !== null ? (
          <p className="text-[11px] font-medium text-[var(--hero-ink)]/45">
            ${asset.usd_value.toLocaleString(undefined, { maximumFractionDigits: 2 })}
          </p>
        ) : null}
      </div>
    </div>
  );
}

function SkeletonRows() {
  return (
    <div className="flex flex-col gap-2">
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="h-16 animate-pulse rounded-2xl border-2 border-[var(--hero-ink)]/10 bg-[var(--hero-ink)]/5"
        />
      ))}
    </div>
  );
}

export function InYourWalletSection() {
  const { wallets, enabledChains, defaultChainId, status: walletStatus } = useAgentWallet();
  const [expanded, setExpanded] = useState(false);
  const [chainId, setChainId] = useState<AgentChainId>(defaultChainId);

  const wallet = wallets.find((w) => w.chainId === chainId);
  const hasAddress = Boolean(wallet?.address);
  const evmChainId = chainId === "ethereum" ? getEvmDefaultChainId() : undefined;
  const walletReady = walletStatus === "ready";

  const { data, loading, error, reload, loadIfNeeded } = useWalletAssets({
    chainId,
    evmChainId,
    enabled: walletReady && hasAddress,
  });

  const handleProfileLoad = useCallback(() => {
    void loadIfNeeded();
  }, [loadIfNeeded]);

  useProfileWalletData(handleProfileLoad);

  useEffect(() => {
    if (expanded && walletReady && hasAddress) {
      void loadIfNeeded();
    }
  }, [chainId, expanded, hasAddress, loadIfNeeded, walletReady]);

  const sortedAssets = useMemo(
    () => (data ? sortAssets(data.assets) : []),
    [data],
  );

  const allZero =
    data !== null && data.assets.every((asset) => asset.balance_atomic === "0");
  const summary = data ? collapsedSummary(sortedAssets) : "Tap to view assets";

  const scrollToFund = () => {
    document.getElementById("agent-wallets")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div className="mt-4 rounded-3xl border-2 border-[var(--hero-ink)] bg-white shadow-[5px_5px_0_var(--hero-ink)]">
      <button
        type="button"
        onClick={() => setExpanded((open) => !open)}
        className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left"
      >
        <span className="flex items-center gap-2">
          <Wallet className="size-4 text-[var(--hero-ink)]/50" strokeWidth={2.5} />
          <span>
            <span className="block text-sm font-bold">In your wallet</span>
            <span className="block text-xs font-medium text-[var(--hero-ink)]/50">
              {loading && !data ? "Loading…" : summary}
            </span>
          </span>
        </span>
        <ChevronDown
          className={`size-5 shrink-0 text-[var(--hero-ink)]/40 transition-transform ${
            expanded ? "rotate-180" : ""
          }`}
          strokeWidth={2.5}
        />
      </button>

      {expanded ? (
        <div className="border-t-2 border-[var(--hero-ink)]/10 px-5 pb-5 pt-4">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            {enabledChains.length > 1 ? (
              <div className="flex flex-wrap gap-2">
                {enabledChains.map((id) => {
                  const meta = getChainMeta(id);
                  const active = id === chainId;
                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setChainId(id)}
                      className={`rounded-full border-2 border-[var(--hero-ink)] px-3 py-1 text-xs font-bold transition-transform hover:-translate-y-0.5 ${
                        active
                          ? "bg-[var(--hero-ink)] text-[var(--hero-bg)]"
                          : "bg-white text-[var(--hero-ink)]"
                      }`}
                    >
                      {meta.label}
                    </button>
                  );
                })}
              </div>
            ) : (
              <span />
            )}
            <button
              type="button"
              disabled={!hasAddress || loading}
              onClick={() => void reload()}
              className="inline-flex items-center gap-1.5 rounded-full border-2 border-[var(--hero-ink)] bg-white px-3 py-1 text-xs font-bold transition-transform hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <RefreshCw className={`size-3.5 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </button>
          </div>

          {!hasAddress ? (
            <p className="text-sm font-medium text-[var(--hero-ink)]/55">
              Your agent wallet is still setting up.
            </p>
          ) : error ? (
            <div className="rounded-2xl border-2 border-[var(--hero-coral)]/30 bg-[var(--hero-coral)]/10 px-4 py-3">
              <p className="text-sm font-semibold text-[var(--hero-coral)]">{error}</p>
              <button
                type="button"
                onClick={() => void reload()}
                className="mt-2 inline-flex items-center gap-1.5 text-sm font-bold text-[var(--hero-blue)] hover:underline"
              >
                <RefreshCw className="size-3.5" />
                Try again
              </button>
            </div>
          ) : loading && !data ? (
            <SkeletonRows />
          ) : (
            <>
              {data && data.total_usd !== null ? (
                <p className="mb-3 text-xs font-bold uppercase tracking-[0.12em] text-[var(--hero-ink)]/40">
                  ≈ ${data.total_usd.toLocaleString(undefined, { maximumFractionDigits: 2 })} total
                </p>
              ) : null}

              {allZero ? (
                <div className="rounded-2xl border-2 border-dashed border-[var(--hero-ink)]/20 bg-[var(--hero-bg)] px-4 py-5 text-center">
                  <p className="text-sm font-semibold text-[var(--hero-ink)]/70">No assets yet</p>
                  <p className="mt-1 text-xs font-medium text-[var(--hero-ink)]/50">
                    Fund your {getChainMeta(chainId).label} agent wallet to get started.
                  </p>
                  <button
                    type="button"
                    onClick={scrollToFund}
                    className="mt-4 rounded-full border-2 border-[var(--hero-ink)] bg-[var(--hero-ink)] px-4 py-2 text-xs font-bold text-[var(--hero-bg)] shadow-[3px_3px_0_var(--hero-coral)]"
                  >
                    Fund wallet
                  </button>
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  {sortedAssets.map((asset) => (
                    <AssetRow key={`${asset.coin_type}-${asset.symbol}`} asset={asset} />
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}
