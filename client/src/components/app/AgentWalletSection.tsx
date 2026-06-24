"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useWallets } from "@mysten/dapp-kit-react";
import {
  Check,
  ChevronDown,
  Copy,
  ExternalLink,
  RefreshCw,
  Wallet,
  WalletMinimal,
} from "lucide-react";
import {
  useAgentWallet,
  type ChainWalletState,
} from "@/components/wallet/AgentWalletProvider";
import { EvmDepositDialog } from "@/components/wallet/deposits/EvmDepositDialog";
import { SolanaDepositDialog } from "@/components/wallet/deposits/SolanaDepositDialog";
import { StellarDepositDialog } from "@/components/wallet/deposits/StellarDepositDialog";
import { SuiDepositDialog } from "@/components/wallet/deposits/SuiDepositDialog";
import type { AgentChainId } from "@/lib/agent-chains";
import {
  formatChainAddress,
  getChainMeta,
  chainExplorerAccountUrl,
  getEvmDefaultChainId,
} from "@/lib/chain-meta";
import { getEnabledEvmNetworks } from "@/lib/evm-chains";
import {
  depositRailForChain,
  isDepositRailAvailable,
} from "@/lib/personal-wallet";
import { invalidateWalletAssetsForChain } from "@/lib/wallet-assets-events";
import { refreshAllWalletData } from "@/lib/refresh-wallet-data";
import { DeepBookBalancesLine } from "@/components/wallet/DeepBookBalancesLine";
import { invalidateDeepBookManagerCache } from "@/lib/wallet-session-cache";
import { useProfileWalletData } from "@/hooks/useProfileWalletData";
import { useWalletAssets } from "@/hooks/useWalletAssets";
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
  const logoUrl = asset.logo_url?.trim() || null;

  return (
    <div
      className={`flex items-center gap-3 rounded-2xl border-2 px-4 py-3 ${
        isZero
          ? "border-[var(--hero-ink)]/10 bg-[var(--hero-bg)]"
          : "border-[var(--hero-ink)]/20 bg-white"
      }`}
    >
      {logoUrl ? (
        <img
          src={logoUrl}
          alt=""
          width={40}
          height={40}
          loading="lazy"
          decoding="async"
          className="size-10 shrink-0 rounded-xl border-2 border-[var(--hero-ink)]/15 bg-white object-cover"
        />
      ) : (
        <span
          className="flex size-10 shrink-0 items-center justify-center rounded-xl border-2 border-[var(--hero-ink)] font-heading text-sm font-extrabold text-white"
          style={{ backgroundColor: accent }}
        >
          {asset.symbol.slice(0, 3)}
        </span>
      )}
      <div className="min-w-0 flex-1">
        <p className="font-heading text-sm font-extrabold tracking-tight">
          {asset.symbol}
        </p>
        <p className="truncate text-xs font-medium text-[var(--hero-ink)]/50">
          {asset.name}
        </p>
      </div>
      <div className="text-right">
        <p className="font-mono text-sm font-bold">
          {formatBalance(asset.balance_display, asset.decimals)}
        </p>
        {asset.usd_value !== null ? (
          <p className="text-[11px] font-medium text-[var(--hero-ink)]/45">
            $
            {asset.usd_value.toLocaleString(undefined, {
              maximumFractionDigits: 2,
            })}
          </p>
        ) : null}
      </div>
    </div>
  );
}

function AssetSkeletonRows() {
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

function AgentWalletAssetsInline({
  chainId,
  evmChainId,
  hasAddress,
  walletReady,
  refreshBalancesOnly,
}: {
  chainId: AgentChainId;
  evmChainId?: number;
  hasAddress: boolean;
  walletReady: boolean;
  refreshBalancesOnly: () => Promise<void>;
}) {
  const [expanded, setExpanded] = useState(false);
  const resolvedEvmChainId =
    chainId === "ethereum" ? (evmChainId ?? getEvmDefaultChainId()) : undefined;

  const { data, loading, error, reload, loadIfNeeded } = useWalletAssets({
    chainId,
    evmChainId: resolvedEvmChainId,
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

  return (
    <div className="mt-5 border-t-2 border-[var(--hero-ink)]/10 pt-4">
      <button
        type="button"
        onClick={() => setExpanded((open) => !open)}
        className="flex w-full items-center justify-between gap-3 text-left"
      >
        <span>
          <span className="block text-sm font-bold">Assets</span>
          <span className="block text-xs font-medium text-[var(--hero-ink)]/50">
            {loading && !data ? "Loading…" : summary}
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
        <div className="pt-4">
          <div className="mb-4 flex flex-wrap items-center justify-end gap-2">
            <button
              type="button"
              disabled={!hasAddress || loading}
              onClick={() =>
                void refreshAllWalletData({ refreshBalancesOnly }).then(() =>
                  reload(),
                )
              }
              className="inline-flex items-center gap-1.5 rounded-full border-2 border-[var(--hero-ink)] bg-white px-3 py-1 text-xs font-bold transition-transform hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <RefreshCw
                className={`size-3.5 ${loading ? "animate-spin" : ""}`}
              />
              Refresh
            </button>
          </div>

          {!hasAddress ? (
            <p className="text-sm font-medium text-[var(--hero-ink)]/55">
              Your agent wallet is still setting up.
            </p>
          ) : error ? (
            <div className="rounded-2xl border-2 border-[var(--hero-coral)]/30 bg-[var(--hero-coral)]/10 px-4 py-3">
              <p className="text-sm font-semibold text-[var(--hero-coral)]">
                {error}
              </p>
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
            <AssetSkeletonRows />
          ) : (
            <>
              {data && data.total_usd !== null ? (
                <p className="mb-3 text-xs font-bold uppercase tracking-[0.12em] text-[var(--hero-ink)]/40">
                  ≈ $
                  {data.total_usd.toLocaleString(undefined, {
                    maximumFractionDigits: 2,
                  })}{" "}
                  total
                </p>
              ) : null}

              {allZero ? (
                <div className="rounded-2xl border-2 border-dashed border-[var(--hero-ink)]/20 bg-[var(--hero-bg)] px-4 py-5 text-center">
                  <p className="text-sm font-semibold text-[var(--hero-ink)]/70">
                    No assets yet
                  </p>
                  <p className="mt-1 text-xs font-medium text-[var(--hero-ink)]/50">
                    Fund your {getChainMeta(chainId).label} agent wallet to get
                    started.
                  </p>
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  {sortedAssets.map((asset) => (
                    <AssetRow
                      key={`${asset.coin_type}-${asset.symbol}`}
                      asset={asset}
                    />
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

function AgentWalletChainCard({
  wallet,
  provisioning,
  onDeposit,
  onCopy,
  copied,
  footer,
  walletReady,
  refreshBalancesOnly,
  evmChainId,
  evmNetworkPicker,
}: {
  wallet: ChainWalletState;
  provisioning: boolean;
  onDeposit: () => void;
  copied: boolean;
  onCopy: () => void;
  footer?: ReactNode;
  walletReady: boolean;
  refreshBalancesOnly: () => Promise<void>;
  evmChainId?: number;
  evmNetworkPicker?: ReactNode;
}) {
  const meta = getChainMeta(wallet.chainId);
  const address = wallet.address ?? "";
  const short = address ? formatChainAddress(wallet.chainId, address) : "—";
  const explorerUrl = chainExplorerAccountUrl(
    wallet.chainId,
    address,
    wallet.chainId === "ethereum" ? evmChainId : undefined,
  );
  const showProvisioning = provisioning && !address;
  return (
    <div className="rounded-3xl border-2 border-[var(--hero-ink)] bg-white p-5 shadow-[4px_4px_0_var(--hero-ink)]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.12em] text-[var(--hero-ink)]/40">
            {wallet.label} agent wallet
          </p>
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
            {showProvisioning ? "Provisioning…" : address || "—"}
          </p>
          <button
            type="button"
            onClick={onCopy}
            disabled={!address}
            className={`flex items-center gap-1 rounded-full border-2 border-[var(--hero-ink)] px-2 py-0.5 text-[10px] font-bold ${
              copied ? "bg-[var(--hero-mint)] text-white" : "bg-white"
            }`}
          >
            {copied ? (
              <Check className="size-3" />
            ) : (
              <Copy className="size-3" />
            )}
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
        <p className="mt-1 text-[10px] font-medium text-[var(--hero-ink)]/45">
          {short}
        </p>
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
          disabled={!address || showProvisioning}
          className="inline-flex items-center gap-2 rounded-full border-2 border-[var(--hero-ink)] bg-[var(--hero-ink)] px-4 py-2 text-xs font-bold text-[var(--hero-bg)] shadow-[3px_3px_0_var(--hero-coral)] disabled:opacity-50"
        >
          <WalletMinimal className="size-3.5" />
          Deposit
        </button>
        {!wallet.signerAdded && !showProvisioning && (
          <span className="text-[10px] font-semibold text-[var(--hero-coral)]">
            Signer pending
          </span>
        )}
      </div>

      <p className="mt-3 text-xs font-medium text-[var(--hero-ink)]/50">
        {meta.depositFallbackHint}
      </p>
      {evmNetworkPicker}
      {footer}
      <AgentWalletAssetsInline
        chainId={wallet.chainId}
        evmChainId={evmChainId}
        hasAddress={Boolean(wallet.address)}
        walletReady={walletReady}
        refreshBalancesOnly={refreshBalancesOnly}
      />
    </div>
  );
}

function AgentWalletOverview({
  wallets,
  enabledChains,
  selectedChainId,
  onSelectChain,
  provisioning,
}: {
  wallets: ChainWalletState[];
  enabledChains: AgentChainId[];
  selectedChainId: AgentChainId;
  onSelectChain: (chainId: AgentChainId) => void;
  provisioning: boolean;
}) {
  if (enabledChains.length <= 1) {
    return null;
  }

  return (
    <div className="mb-5 grid gap-2 sm:grid-cols-2">
      {enabledChains.map((chainId) => {
        const wallet = wallets.find((w) => w.chainId === chainId);
        const meta = getChainMeta(chainId);
        const address = wallet?.address ?? "";
        const isSelected = chainId === selectedChainId;
        const showProvisioning = provisioning && !address;

        return (
          <button
            key={chainId}
            type="button"
            onClick={() => onSelectChain(chainId)}
            className={`rounded-2xl border-2 px-4 py-3 text-left transition-transform hover:-translate-y-0.5 ${
              isSelected
                ? "border-[var(--hero-ink)] bg-[var(--hero-violet)]/10 shadow-[3px_3px_0_var(--hero-ink)]"
                : "border-[var(--hero-ink)]/15 bg-white"
            }`}
          >
            <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--hero-ink)]/45">
              {meta.label}
            </p>
            <p className="mt-1 font-mono text-xs font-semibold text-[var(--hero-ink)]/75">
              {showProvisioning
                ? "Provisioning…"
                : address
                  ? formatChainAddress(chainId, address)
                  : "Not set up"}
            </p>
            {chainId === "ethereum" && address ? (
              <p className="mt-1 text-[10px] font-medium text-[var(--hero-ink)]/45">
                Same 0x on Ethereum, Arbitrum, Base
              </p>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

export function AgentWalletSection() {
  const {
    status: walletStatus,
    provisioning,
    wallets,
    defaultChainId,
    enabledChains,
    error: walletError,
    refresh: refreshAgentWallet,
    refreshBalancesOnly,
  } = useAgentWallet();

  const suiWallets = useWallets();
  const [selectedChainId, setSelectedChainId] =
    useState<AgentChainId>(defaultChainId);
  const [prevDefaultChainId, setPrevDefaultChainId] =
    useState<AgentChainId>(defaultChainId);
  const [copiedChain, setCopiedChain] = useState<AgentChainId | null>(null);
  const [depositChain, setDepositChain] = useState<AgentChainId | null>(null);
  const [depositHint, setDepositHint] = useState<string | null>(null);
  const [selectedEvmChainId, setSelectedEvmChainId] = useState(() => getEvmDefaultChainId());
  const enabledEvmNetworks = useMemo(() => getEnabledEvmNetworks(), []);

  const walletReady = walletStatus === "ready";
  const [refreshingAll, setRefreshingAll] = useState(false);
  const autoProvisionRef = useRef(false);

  const hasMissingWallet = enabledChains.some(
    (chainId) => !wallets.find((w) => w.chainId === chainId)?.address,
  );

  useEffect(() => {
    if (autoProvisionRef.current) return;
    if (!hasMissingWallet || provisioning || walletStatus === "loading") {
      return;
    }
    autoProvisionRef.current = true;
    refreshAgentWallet();
  }, [hasMissingWallet, provisioning, refreshAgentWallet, walletStatus]);

  if (defaultChainId !== prevDefaultChainId) {
    setPrevDefaultChainId(defaultChainId);
    setSelectedChainId(defaultChainId);
  }

  const activeChainId = enabledChains.includes(selectedChainId)
    ? selectedChainId
    : defaultChainId;
  const selectedWallet = wallets.find((w) => w.chainId === activeChainId);
  const walletActionsDisabled =
    provisioning || (!walletReady && !selectedWallet?.address);

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
  const stellarWallet = wallets.find((w) => w.chainId === "stellar");

  const evmNetworkPicker =
    activeChainId === "ethereum" && enabledEvmNetworks.length > 1 ? (
      <div className="mt-4 flex flex-wrap gap-2">
        <span className="w-full text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--hero-ink)]/40">
          EVM network (assets)
        </span>
        {enabledEvmNetworks.map((network) => (
          <button
            key={network.chainId}
            type="button"
            onClick={() => setSelectedEvmChainId(network.chainId)}
            className={`rounded-full border-2 px-3 py-1 text-xs font-bold ${
              selectedEvmChainId === network.chainId
                ? "border-[var(--hero-ink)] bg-[var(--hero-ink)] text-[var(--hero-bg)]"
                : "border-[var(--hero-ink)]/25 bg-white text-[var(--hero-ink)]"
            }`}
          >
            {network.label}
          </button>
        ))}
      </div>
    ) : null;

  return (
    <>
      <section
        id="agent-wallets"
        data-settings-block
        className="mt-10 scroll-mt-8"
      >
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-[0.2em] text-[var(--hero-ink)]/40">
            <Wallet className="size-4" strokeWidth={2.5} />
            Agent wallet
          </h2>
          <div className="flex flex-wrap items-center gap-2">
            {enabledChains.length > 1 ? (
              <div className="relative">
                <select
                  value={activeChainId}
                  onChange={(e) =>
                    setSelectedChainId(e.target.value as AgentChainId)
                  }
                  aria-label="Select agent wallet chain"
                  className="appearance-none rounded-full border-2 border-[var(--hero-ink)] bg-white py-1.5 pl-3 pr-8 text-xs font-bold transition-transform hover:-translate-y-0.5"
                >
                  {enabledChains.map((id) => {
                    const meta = getChainMeta(id);
                    return (
                      <option key={id} value={id}>
                        {meta.label}
                        {id === defaultChainId ? " · default" : ""}
                      </option>
                    );
                  })}
                </select>
                <ChevronDown
                  className="pointer-events-none absolute right-2.5 top-1/2 size-3.5 -translate-y-1/2 text-[var(--hero-ink)]/50"
                  strokeWidth={2.5}
                />
              </div>
            ) : (
              <span className="rounded-full border-2 border-[var(--hero-ink)] bg-[var(--hero-violet)]/10 px-3 py-1 text-xs font-bold text-[var(--hero-violet)] shadow-[2px_2px_0_var(--hero-ink)]">
                {getChainMeta(defaultChainId).label}
              </span>
            )}
            <button
              type="button"
              disabled={walletActionsDisabled || refreshingAll}
              onClick={() => void handleRefreshAll()}
              className="inline-flex items-center gap-1.5 rounded-full border-2 border-[var(--hero-ink)] bg-white px-3 py-1 text-xs font-bold transition-transform hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <RefreshCw
                className={`size-3.5 ${refreshingAll ? "animate-spin" : ""}`}
              />
              Refresh balances
            </button>
          </div>
        </div>

        <p className="mb-5 text-sm font-medium leading-relaxed text-[var(--hero-ink)]/55">
          Your agent&apos;s embedded wallet on{" "}
          {getChainMeta(activeChainId).label}. Switch chains to view other
          wallets
          {enabledChains.includes("ethereum")
            ? " — the same 0x address is used across EVM networks"
            : ""}
          .
        </p>

        {depositHint ? (
          <div className="mb-5 rounded-2xl border-2 border-[var(--hero-ink)]/20 bg-[var(--hero-bg)] px-4 py-3">
            <p className="text-sm font-medium text-[var(--hero-ink)]/70">
              {depositHint}
            </p>
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
            <p className="text-sm font-semibold text-[var(--hero-coral)]">
              {walletError}
            </p>
            <button
              type="button"
              onClick={refreshAgentWallet}
              className="mt-2 text-sm font-bold text-[var(--hero-blue)] hover:underline"
            >
              Try again
            </button>
          </div>
        ) : null}

        <AgentWalletOverview
          wallets={wallets}
          enabledChains={enabledChains}
          selectedChainId={activeChainId}
          onSelectChain={setSelectedChainId}
          provisioning={provisioning}
        />

        <div className="flex flex-col gap-4">
          {selectedWallet ? (
            <AgentWalletChainCard
              wallet={{
                ...selectedWallet,
                label:
                  selectedWallet.chainId === defaultChainId
                    ? `${selectedWallet.label} · default`
                    : selectedWallet.label,
              }}
              provisioning={provisioning}
              copied={copiedChain === selectedWallet.chainId}
              walletReady={walletReady}
              refreshBalancesOnly={refreshBalancesOnly}
              evmChainId={
                selectedWallet.chainId === "ethereum" ? selectedEvmChainId : undefined
              }
              evmNetworkPicker={evmNetworkPicker}
              onCopy={() => {
                if (selectedWallet.address) {
                  void copyAddress(
                    selectedWallet.chainId,
                    selectedWallet.address,
                  );
                }
              }}
              onDeposit={() => openDeposit(selectedWallet.chainId)}
              footer={
                selectedWallet.chainId === "sui" &&
                walletReady &&
                selectedWallet.address ? (
                  <DeepBookBalancesLine
                    enabled={walletReady}
                    walletSuiBalance={selectedWallet.balanceDisplay}
                  />
                ) : null
              }
            />
          ) : null}
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

      {stellarWallet?.address && (
        <StellarDepositDialog
          open={depositChain === "stellar"}
          onOpenChange={(open) => !open && setDepositChain(null)}
          agentAddress={stellarWallet.address}
        />
      )}
    </>
  );
}
