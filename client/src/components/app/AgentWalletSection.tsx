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
import { ChainLogo } from "@/components/wallet/ChainLogo";
import { EvmChainStack } from "@/components/wallet/EvmChainStack";
import { DeepBookBalancesLine } from "@/components/wallet/DeepBookBalancesLine";
import { invalidateDeepBookManagerCache } from "@/lib/wallet-session-cache";
import type { EvmNetworkMeta } from "@/lib/evm-chains";
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

function AgentWalletAssetsPanel({
  chainId,
  evmChainId,
  hasAddress,
  walletReady,
  refreshBalancesOnly,
  expanded,
}: {
  chainId: AgentChainId;
  evmChainId?: number;
  hasAddress: boolean;
  walletReady: boolean;
  refreshBalancesOnly: () => Promise<void>;
  expanded: boolean;
}) {
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

  if (!expanded) {
    return null;
  }

  return (
    <div className="mt-3 border-t-2 border-dashed border-[var(--hero-ink)]/15 pt-3">
      <div className="mb-3 flex items-center justify-between gap-2">
        <p className="text-xs font-bold uppercase tracking-[0.12em] text-[var(--hero-ink)]/40">
          {getChainMeta(chainId).label} assets
        </p>
        <button
          type="button"
          disabled={!hasAddress || loading}
          onClick={() =>
            void refreshAllWalletData({ refreshBalancesOnly }).then(() =>
              reload(),
            )
          }
          className="inline-flex items-center gap-1.5 rounded-full border-2 border-[var(--hero-ink)] bg-white px-2.5 py-0.5 text-[10px] font-bold transition-transform hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <RefreshCw className={`size-3 ${loading ? "animate-spin" : ""}`} />
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
  );
}

function WalletAddressCopyButton({
  copied,
  disabled,
  onCopy,
}: {
  copied: boolean;
  disabled: boolean;
  onCopy: () => void;
}) {
  return (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation();
        onCopy();
      }}
      disabled={disabled}
      aria-label={copied ? "Address copied" : "Copy wallet address"}
      className={`flex size-8 shrink-0 items-center justify-center rounded-full border-2 border-[var(--hero-ink)] transition-colors ${
        copied
          ? "bg-[var(--hero-mint)] text-white"
          : "bg-white hover:bg-[var(--hero-bg)]"
      } disabled:cursor-not-allowed disabled:opacity-50`}
    >
      {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
    </button>
  );
}

function AgentWalletChainRow({
  wallet,
  provisioning,
  expanded,
  onToggle,
  copied,
  onCopy,
  onDeposit,
  walletReady,
  refreshBalancesOnly,
  evmChainId,
  onEvmChainIdChange,
  evmNetworks,
  footer,
}: {
  wallet: ChainWalletState;
  provisioning: boolean;
  expanded: boolean;
  onToggle: () => void;
  copied: boolean;
  onCopy: () => void;
  onDeposit: () => void;
  walletReady: boolean;
  refreshBalancesOnly: () => Promise<void>;
  evmChainId?: number;
  onEvmChainIdChange?: (chainId: number) => void;
  evmNetworks: EvmNetworkMeta[];
  footer?: ReactNode;
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
    <div
      className={`rounded-2xl border-2 px-4 py-3 transition-colors ${
        expanded
          ? "border-[var(--hero-ink)] bg-[var(--hero-violet)]/5 shadow-[2px_2px_0_var(--hero-ink)]"
          : "border-[var(--hero-ink)]/15 bg-white hover:border-[var(--hero-ink)]/40"
      }`}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        className="flex w-full items-center justify-between gap-3 text-left"
      >
        <div className="flex min-w-0 items-center gap-3">
          {wallet.chainId === "ethereum" ? (
            <EvmChainStack networks={evmNetworks} size={36} />
          ) : (
            <ChainLogo chainId={wallet.chainId} size={36} />
          )}
          <div className="min-w-0">
            <p className="text-sm font-extrabold uppercase tracking-wide text-[var(--hero-ink)]">
              {meta.label}
            </p>
            <p
              className={`text-[10px] font-bold uppercase tracking-[0.1em] ${
                wallet.funded
                  ? "text-[var(--hero-mint)]"
                  : "text-[var(--hero-ink)]/40"
              }`}
            >
              {wallet.funded ? "Funded" : "Empty"}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className="font-mono text-xs font-semibold text-[var(--hero-ink)]/70">
            {showProvisioning ? "Provisioning…" : short}
          </span>
          <WalletAddressCopyButton
            copied={copied}
            disabled={!address || showProvisioning}
            onCopy={onCopy}
          />
          <ChevronDown
            className={`size-4 shrink-0 text-[var(--hero-ink)]/40 transition-transform ${
              expanded ? "rotate-180" : ""
            }`}
            strokeWidth={2.5}
          />
        </div>
      </button>

      {expanded ? (
        <div className="mt-3">
          {explorerUrl ? (
            <a
              href={explorerUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(event) => event.stopPropagation()}
              className="inline-flex items-center gap-1 text-[10px] font-bold text-[var(--hero-blue)] hover:underline"
            >
              View on explorer
              <ExternalLink className="size-3" />
            </a>
          ) : null}

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onDeposit();
              }}
              disabled={!address || showProvisioning}
              className="inline-flex items-center gap-2 rounded-full border-2 border-[var(--hero-ink)] bg-[var(--hero-ink)] px-4 py-2 text-xs font-bold text-[var(--hero-bg)] shadow-[3px_3px_0_var(--hero-coral)] disabled:opacity-50"
            >
              <WalletMinimal className="size-3.5" />
              Deposit
            </button>
            {!wallet.signerAdded && !showProvisioning ? (
              <span className="text-[10px] font-semibold text-[var(--hero-coral)]">
                Signer pending
              </span>
            ) : null}
          </div>

          {wallet.chainId === "ethereum" &&
          evmNetworks.length > 1 &&
          onEvmChainIdChange ? (
            <div className="mt-3 flex flex-wrap gap-2">
              <span className="w-full text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--hero-ink)]/40">
                EVM network (assets)
              </span>
              {evmNetworks.map((network) => {
                const networkFunded =
                  wallet.evmFundedByNetwork?.[network.chainId] === true;
                return (
                <button
                  key={network.chainId}
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    onEvmChainIdChange(network.chainId);
                  }}
                  className={`relative rounded-full border-2 px-3 py-1 text-xs font-bold ${
                    evmChainId === network.chainId
                      ? "border-[var(--hero-ink)] bg-[var(--hero-ink)] text-[var(--hero-bg)]"
                      : "border-[var(--hero-ink)]/25 bg-white text-[var(--hero-ink)]"
                  }`}
                >
                  {networkFunded ? (
                    <span
                      className="absolute -right-0.5 -top-0.5 size-2 rounded-full bg-[var(--hero-mint)] ring-2 ring-white"
                      aria-hidden
                    />
                  ) : null}
                  {network.label}
                </button>
                );
              })}
            </div>
          ) : null}

          {footer}

          <AgentWalletAssetsPanel
            chainId={wallet.chainId}
            evmChainId={evmChainId}
            hasAddress={Boolean(wallet.address)}
            walletReady={walletReady}
            refreshBalancesOnly={refreshBalancesOnly}
            expanded
          />
        </div>
      ) : null}
    </div>
  );
}

function AgentWalletUnifiedCard({
  wallets,
  enabledChains,
  expandedChainId,
  onToggleChain,
  provisioning,
  copiedChain,
  onCopyAddress,
  onDeposit,
  walletReady,
  refreshBalancesOnly,
  selectedEvmChainId,
  onEvmChainIdChange,
  evmNetworks,
}: {
  wallets: ChainWalletState[];
  enabledChains: AgentChainId[];
  expandedChainId: AgentChainId | null;
  onToggleChain: (chainId: AgentChainId) => void;
  provisioning: boolean;
  copiedChain: AgentChainId | null;
  onCopyAddress: (chainId: AgentChainId, address: string) => void;
  onDeposit: (chainId: AgentChainId) => void;
  walletReady: boolean;
  refreshBalancesOnly: () => Promise<void>;
  selectedEvmChainId: number;
  onEvmChainIdChange: (chainId: number) => void;
  evmNetworks: EvmNetworkMeta[];
}) {
  return (
    <div className="rounded-3xl border-2 border-[var(--hero-ink)] bg-white p-5 shadow-[4px_4px_0_var(--hero-ink)]">
      <p className="text-xs font-bold uppercase tracking-[0.12em] text-[var(--hero-ink)]/40">
        Agent wallet
      </p>
      <p className="mt-1 text-xs font-medium text-[var(--hero-ink)]/50">
        Tap a chain to view its address, explorer, and assets.
      </p>

      <div className="mt-4 flex flex-col gap-2">
        {enabledChains.map((chainId) => {
          const wallet = wallets.find((w) => w.chainId === chainId);
          if (!wallet) return null;

          return (
            <AgentWalletChainRow
              key={chainId}
              wallet={wallet}
              provisioning={provisioning}
              expanded={expandedChainId === chainId}
              onToggle={() => onToggleChain(chainId)}
              copied={copiedChain === chainId}
              onCopy={() => {
                if (wallet.address) onCopyAddress(chainId, wallet.address);
              }}
              onDeposit={() => onDeposit(chainId)}
              walletReady={walletReady}
              refreshBalancesOnly={refreshBalancesOnly}
              evmChainId={
                chainId === "ethereum" ? selectedEvmChainId : undefined
              }
              onEvmChainIdChange={
                chainId === "ethereum" ? onEvmChainIdChange : undefined
              }
              evmNetworks={evmNetworks}
              footer={
                chainId === "sui" && walletReady && wallet.address ? (
                  <DeepBookBalancesLine
                    enabled={walletReady}
                    walletSuiBalance={wallet.balanceDisplay}
                  />
                ) : null
              }
            />
          );
        })}
      </div>
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
  // Start collapsed — the wallet rows (incl. Sui) should be closed when you
  // open Settings, not auto-expanded.
  const [expandedChainId, setExpandedChainId] = useState<AgentChainId | null>(
    null,
  );
  const [prevDefaultChainId, setPrevDefaultChainId] =
    useState<AgentChainId>(defaultChainId);
  const [copiedChain, setCopiedChain] = useState<AgentChainId | null>(null);
  const [depositChain, setDepositChain] = useState<AgentChainId | null>(null);
  const [depositHint, setDepositHint] = useState<string | null>(null);
  const [selectedEvmChainId, setSelectedEvmChainId] = useState(() =>
    getEvmDefaultChainId(),
  );
  const enabledEvmNetworks = useMemo(() => getEnabledEvmNetworks(), []);

  const walletReady = walletStatus === "ready";
  const [refreshingAll, setRefreshingAll] = useState(false);
  const autoProvisionRef = useRef(false);

  const hasMissingWallet = enabledChains.some(
    (chainId) => !wallets.find((w) => w.chainId === chainId)?.address,
  );

  useEffect(() => {
    if (autoProvisionRef.current) return;
    if (walletStatus !== "ready") return;
    if (!hasMissingWallet || provisioning) return;
    autoProvisionRef.current = true;
    refreshAgentWallet();
  }, [hasMissingWallet, provisioning, refreshAgentWallet, walletStatus]);

  if (defaultChainId !== prevDefaultChainId) {
    setPrevDefaultChainId(defaultChainId);
    setExpandedChainId(defaultChainId);
  }

  const walletActionsDisabled =
    provisioning || (!walletReady && wallets.every((w) => !w.address));

  const handleRefreshAll = async () => {
    setRefreshingAll(true);
    try {
      await refreshAllWalletData({ refreshBalancesOnly });
    } finally {
      setRefreshingAll(false);
    }
  };

  const toggleChain = (chainId: AgentChainId) => {
    setExpandedChainId((current) => (current === chainId ? null : chainId));
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

        <AgentWalletUnifiedCard
          wallets={wallets}
          enabledChains={enabledChains}
          expandedChainId={expandedChainId}
          onToggleChain={toggleChain}
          provisioning={provisioning}
          copiedChain={copiedChain}
          onCopyAddress={(chainId, address) =>
            void copyAddress(chainId, address)
          }
          onDeposit={openDeposit}
          walletReady={walletReady}
          refreshBalancesOnly={refreshBalancesOnly}
          selectedEvmChainId={selectedEvmChainId}
          onEvmChainIdChange={setSelectedEvmChainId}
          evmNetworks={enabledEvmNetworks}
        />
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
