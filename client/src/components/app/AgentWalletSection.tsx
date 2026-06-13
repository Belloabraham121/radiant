"use client";

import { useState, type ReactNode } from "react";
import { useWallets } from "@mysten/dapp-kit-react";
import { Check, Copy, ExternalLink, Loader2, RefreshCw, Wallet, WalletMinimal } from "lucide-react";
import { useAgentWallet, type ChainWalletState } from "@/components/wallet/AgentWalletProvider";
import { EvmDepositDialog } from "@/components/wallet/deposits/EvmDepositDialog";
import { SolanaDepositDialog } from "@/components/wallet/deposits/SolanaDepositDialog";
import { SuiDepositDialog } from "@/components/wallet/deposits/SuiDepositDialog";
import type { AgentChainId } from "@/lib/agent-chains";
import { formatChainAddress, getChainMeta, chainExplorerAccountUrl, formatNativeBalance, getEvmDefaultChainId } from "@/lib/chain-meta";
import {
  depositRailForChain,
  isDepositRailAvailable,
} from "@/lib/personal-wallet";
import { invalidateWalletAssetsForChain } from "@/lib/wallet-assets-events";
import { refreshAllWalletData } from "@/lib/refresh-wallet-data";
import { DeepBookBalancesLine } from "@/components/wallet/DeepBookBalancesLine";
import { invalidateDeepBookManagerCache } from "@/lib/wallet-session-cache";

function AgentWalletChainCard({
  wallet,
  loading,
  onDeposit,
  onCopy,
  copied,
  footer,
}: {
  wallet: ChainWalletState;
  loading: boolean;
  onDeposit: () => void;
  copied: boolean;
  onCopy: () => void;
  footer?: ReactNode;
}) {
  const meta = getChainMeta(wallet.chainId);
  const address = wallet.address ?? "";
  const short = address ? formatChainAddress(wallet.chainId, address) : "—";
  const explorerUrl = chainExplorerAccountUrl(wallet.chainId, address);
  return (
    <div className="rounded-3xl border-2 border-[var(--hero-ink)] bg-white p-5 shadow-[4px_4px_0_var(--hero-ink)]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.12em] text-[var(--hero-ink)]/40">
            {wallet.label} agent wallet
          </p>
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--hero-ink)]/40">
            Available {wallet.nativeSymbol}
          </p>
          <p className="mt-1 font-heading text-3xl font-extrabold tracking-tight">
            {loading ? (
              <span className="inline-flex items-center gap-2 text-lg text-[var(--hero-ink)]/40">
                <Loader2 className="size-5 animate-spin" />
                Setting up…
              </span>
            ) : wallet.balanceDisplay === null ? (
              <span className="text-lg text-[var(--hero-ink)]/45">— {wallet.nativeSymbol}</span>
            ) : (
              <>
                {formatNativeBalance(wallet.balanceDisplay)}{" "}
                <span className="text-base text-[var(--hero-ink)]/45">{wallet.nativeSymbol}</span>
              </>
            )}
          </p>
          {wallet.chainId === "sui" && wallet.balanceDisplay !== null ? (
            <p className="mt-1 text-[11px] font-medium text-[var(--hero-ink)]/45">
              Spendable in this wallet. DeepBook manager funds are listed below.
            </p>
          ) : null}
        </div>
        {wallet.funded ? (
          <span className="rounded-full border-2 border-[var(--hero-ink)] bg-[var(--hero-mint)]/15 px-2.5 py-0.5 text-[10px] font-bold uppercase text-[var(--hero-mint)]">
            Funded
          </span>
        ) : (
          <span className="rounded-full border-2 border-[var(--hero-ink)]/20 px-2.5 py-0.5 text-[10px] font-bold uppercase text-[var(--hero-ink)]/40">
            Empty
          </span>
        )}
      </div>

      <div className="mt-4 rounded-2xl border-2 border-dashed border-[var(--hero-ink)]/20 bg-[var(--hero-bg)] px-3 py-3">
        <div className="flex items-center justify-between gap-2">
          <p className="font-mono text-xs font-semibold text-[var(--hero-ink)]/70">
            {loading ? "Provisioning…" : address || "—"}
          </p>
          <button
            type="button"
            onClick={onCopy}
            disabled={!address}
            className={`flex items-center gap-1 rounded-full border-2 border-[var(--hero-ink)] px-2 py-0.5 text-[10px] font-bold ${
              copied ? "bg-[var(--hero-mint)] text-white" : "bg-white"
            }`}
          >
            {copied ? <Check className="size-3" /> : <Copy className="size-3" />}
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
        <p className="mt-1 text-[10px] font-medium text-[var(--hero-ink)]/45">{short}</p>
        {explorerUrl ? (
          <a
            href={explorerUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2 inline-flex items-center gap-1 text-[10px] font-bold text-[var(--hero-blue)] hover:underline"
          >
            View on explorer
            <ExternalLink className="size-3" />
          </a>
        ) : null}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={onDeposit}
          disabled={!address || loading}
          className="inline-flex items-center gap-2 rounded-full border-2 border-[var(--hero-ink)] bg-[var(--hero-ink)] px-4 py-2 text-xs font-bold text-[var(--hero-bg)] shadow-[3px_3px_0_var(--hero-coral)] disabled:opacity-50"
        >
          <WalletMinimal className="size-3.5" />
          Deposit
        </button>
        {!wallet.signerAdded && !loading && (
          <span className="text-[10px] font-semibold text-[var(--hero-coral)]">
            Signer pending
          </span>
        )}
      </div>

      <p className="mt-3 text-xs font-medium text-[var(--hero-ink)]/50">{meta.depositFallbackHint}</p>
      {footer}
    </div>
  );
}

export function AgentWalletSection() {
  const {
    status: walletStatus,
    wallets,
    defaultChainId,
    enabledChains,
    error: walletError,
    refresh: refreshAgentWallet,
    refreshBalancesOnly,
  } = useAgentWallet();

  const suiWallets = useWallets();
  const [copiedChain, setCopiedChain] = useState<AgentChainId | null>(null);
  const [depositChain, setDepositChain] = useState<AgentChainId | null>(null);
  const [depositHint, setDepositHint] = useState<string | null>(null);

  const walletLoading = walletStatus === "loading" || walletStatus === "idle";
  const walletReady = walletStatus === "ready";
  const [refreshingAll, setRefreshingAll] = useState(false);

  const handleRefreshAll = async () => {
    setRefreshingAll(true);
    try {
      await refreshAllWalletData({ refreshBalancesOnly });
    } finally {
      setRefreshingAll(false);
    }
  };

  const copyAddress = async (chainId: AgentChainId, address: string) => {
    try {
      await navigator.clipboard.writeText(address);
      setCopiedChain(chainId);
      setTimeout(() => setCopiedChain(null), 1500);
    } catch {
      // clipboard unavailable
    }
  };

  const openDeposit = (chainId: AgentChainId) => {
    const rail = depositRailForChain(chainId);
    const railReady = isDepositRailAvailable(rail, {
      suiWalletsDetected: suiWallets.length > 0,
    });
    if (!railReady && rail !== "direct-only") {
      setDepositHint(getChainMeta(chainId).depositFallbackHint);
      return;
    }
    setDepositHint(null);
    setDepositChain(chainId);
  };

  const suiWallet = wallets.find((w) => w.chainId === "sui");
  const evmWallet = wallets.find((w) => w.chainId === "ethereum");
  const solanaWallet = wallets.find((w) => w.chainId === "solana");

  return (
    <>
      <section id="agent-wallets" data-settings-block className="mt-10 scroll-mt-8">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-[0.2em] text-[var(--hero-ink)]/40">
            <Wallet className="size-4" strokeWidth={2.5} />
            Agent wallets
          </h2>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={walletLoading || !walletReady || refreshingAll}
              onClick={() => void handleRefreshAll()}
              className="inline-flex items-center gap-1.5 rounded-full border-2 border-[var(--hero-ink)] bg-white px-3 py-1 text-xs font-bold transition-transform hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <RefreshCw className={`size-3.5 ${refreshingAll ? "animate-spin" : ""}`} />
              Refresh balances
            </button>
            <span className="rounded-full border-2 border-[var(--hero-ink)] bg-[var(--hero-violet)]/10 px-3 py-1 text-xs font-bold text-[var(--hero-violet)] shadow-[2px_2px_0_var(--hero-ink)]">
              Default: {getChainMeta(defaultChainId).label}
            </span>
          </div>
        </div>

        <p className="mb-5 text-sm font-medium leading-relaxed text-[var(--hero-ink)]/55">
          One embedded wallet per chain family. Fund each so your agent can operate on Sui,
          EVM ({enabledChains.includes("ethereum") ? "same 0x on all EVM networks" : "off"}),
          and Solana.
        </p>

        {depositHint ? (
          <div className="mb-5 rounded-2xl border-2 border-[var(--hero-ink)]/20 bg-[var(--hero-bg)] px-4 py-3">
            <p className="text-sm font-medium text-[var(--hero-ink)]/70">{depositHint}</p>
            <button
              type="button"
              onClick={() => setDepositHint(null)}
              className="mt-2 text-sm font-bold text-[var(--hero-blue)] hover:underline"
            >
              Dismiss
            </button>
          </div>
        ) : null}

        {walletError ? (
          <div className="mb-5 rounded-2xl border-2 border-[var(--hero-coral)]/30 bg-[var(--hero-coral)]/10 px-4 py-3">
            <p className="text-sm font-semibold text-[var(--hero-coral)]">{walletError}</p>
            <button
              type="button"
              onClick={refreshAgentWallet}
              className="mt-2 text-sm font-bold text-[var(--hero-blue)] hover:underline"
            >
              Try again
            </button>
          </div>
        ) : null}

        <div className="flex flex-col gap-4">
          {wallets.map((wallet) => (
            <AgentWalletChainCard
              key={wallet.chainId}
              wallet={{
                ...wallet,
                label:
                  wallet.chainId === defaultChainId
                    ? `${wallet.label} · default`
                    : wallet.label,
              }}
              loading={walletLoading}
              copied={copiedChain === wallet.chainId}
              onCopy={() => {
                if (wallet.address) void copyAddress(wallet.chainId, wallet.address);
              }}
              onDeposit={() => openDeposit(wallet.chainId)}
              footer={
                wallet.chainId === "sui" && walletReady && wallet.address ? (
                  <DeepBookBalancesLine
                    enabled={walletReady}
                    walletSuiBalance={wallet.balanceDisplay}
                  />
                ) : null
              }
            />
          ))}
        </div>
      </section>

      {suiWallet?.address && (
        <SuiDepositDialog
          open={depositChain === "sui"}
          onOpenChange={(open) => !open && setDepositChain(null)}
          agentAddress={suiWallet.address}
          agentShort={formatChainAddress("sui", suiWallet.address)}
          onSuccess={() => {
            void refreshBalancesOnly();
            invalidateWalletAssetsForChain("sui");
            invalidateDeepBookManagerCache();
          }}
        />
      )}

      {evmWallet?.address && (
        <EvmDepositDialog
          open={depositChain === "ethereum"}
          onOpenChange={(open) => !open && setDepositChain(null)}
          agentAddress={evmWallet.address}
          onSuccess={() => {
            void refreshBalancesOnly();
            invalidateWalletAssetsForChain("ethereum", getEvmDefaultChainId());
          }}
        />
      )}

      {solanaWallet?.address && (
        <SolanaDepositDialog
          open={depositChain === "solana"}
          onOpenChange={(open) => !open && setDepositChain(null)}
          agentAddress={solanaWallet.address}
          onSuccess={() => {
            void refreshBalancesOnly();
            invalidateWalletAssetsForChain("solana");
          }}
        />
      )}
    </>
  );
}
