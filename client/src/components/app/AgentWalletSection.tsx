"use client";

import { useEffect, useState } from "react";
import {
  type UiWallet,
  getWalletUniqueIdentifier,
  useCurrentAccount,
  useCurrentNetwork,
  useCurrentWallet,
  useDAppKit,
  useWalletConnection,
  useWallets,
} from "@mysten/dapp-kit-react";
import { Transaction, coinWithBalance } from "@mysten/sui/transactions";
import { formatAddress, parseToMist } from "@mysten/sui/utils";
import {
  ArrowRight,
  Check,
  Copy,
  ExternalLink,
  Loader2,
  Wallet,
  WalletMinimal,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { dAppKit } from "@/lib/dapp-kit";
import {
  getAgentWalletAddress,
  getAgentWalletShort,
  mistToSui,
  NETWORK_LABELS,
  type SuiNetwork,
} from "@/lib/sui-config";

type DepositStep = "connect" | "amount" | "confirm" | "done";

function parseAmountMist(value: string): bigint | null {
  try {
    const mist = parseToMist(value);
    return mist > BigInt(0) ? mist : null;
  } catch {
    return null;
  }
}

function walletIcon(wallet: UiWallet): string | undefined {
  return typeof wallet.icon === "string" ? wallet.icon : undefined;
}

function explorerTxUrl(network: string, digest: string): string {
  const base =
    network === "mainnet"
      ? "https://suiscan.xyz/mainnet/tx"
      : network === "devnet"
        ? "https://suiscan.xyz/devnet/tx"
        : "https://suiscan.xyz/testnet/tx";
  return `${base}/${digest}`;
}

function AgentBalance({
  address,
  network,
  refreshToken,
}: {
  address: string;
  network: SuiNetwork;
  refreshToken: number;
}) {
  const [balance, setBalance] = useState<number | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const client = dAppKit.getClient(network);
        const { balance: coinBalance } = await client.getBalance({ owner: address });
        if (!cancelled) setBalance(mistToSui(coinBalance.balance));
      } catch {
        if (!cancelled) setBalance(null);
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [address, network, refreshToken]);

  if (!loaded) {
    return (
      <span className="inline-flex items-center gap-2 text-2xl text-[var(--hero-ink)]/40">
        <Loader2 className="size-6 animate-spin" />
        Loading…
      </span>
    );
  }

  if (balance === null) {
    return <span className="text-xl text-[var(--hero-ink)]/45">— SUI</span>;
  }

  return (
    <>
      {balance.toFixed(4)} <span className="text-xl text-[var(--hero-ink)]/45">SUI</span>
    </>
  );
}

function ConnectedBalance({
  address,
  network,
  refreshToken,
}: {
  address: string;
  network: SuiNetwork;
  refreshToken: number;
}) {
  const [balance, setBalance] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const client = dAppKit.getClient(network);
        const { balance: coinBalance } = await client.getBalance({ owner: address });
        if (!cancelled) setBalance(mistToSui(coinBalance.balance));
      } catch {
        if (!cancelled) setBalance(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [address, network, refreshToken]);

  if (balance === null) return null;

  return (
    <span className="ml-2 text-[var(--hero-ink)]/40">· {balance.toFixed(4)} SUI</span>
  );
}

export function AgentWalletSection() {
  const dAppKitInstance = useDAppKit();
  const wallets = useWallets();
  const connection = useWalletConnection();
  const account = useCurrentAccount();
  const wallet = useCurrentWallet();
  const network = useCurrentNetwork() as SuiNetwork;

  const agentAddress = getAgentWalletAddress();
  const agentShort = getAgentWalletShort();

  const [copied, setCopied] = useState(false);
  const [depositOpen, setDepositOpen] = useState(false);
  const [depositStep, setDepositStep] = useState<DepositStep>("connect");
  const [amount, setAmount] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [connectingId, setConnectingId] = useState<string | null>(null);
  const [connectError, setConnectError] = useState<string | null>(null);
  const [txError, setTxError] = useState<string | null>(null);
  const [txDigest, setTxDigest] = useState<string | null>(null);
  const [balanceRefresh, setBalanceRefresh] = useState(0);

  const copyAddress = async () => {
    try {
      await navigator.clipboard.writeText(agentAddress);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard unavailable
    }
  };

  const resetDeposit = () => {
    setAmount("");
    setConfirming(false);
    setConnectingId(null);
    setConnectError(null);
    setTxError(null);
    setTxDigest(null);
  };

  const closeDeposit = () => {
    setDepositOpen(false);
    setDepositStep("connect");
    setTimeout(resetDeposit, 200);
  };

  const openDeposit = () => {
    resetDeposit();
    setDepositStep(connection.isConnected ? "amount" : "connect");
    setDepositOpen(true);
  };

  const handleConnectWallet = async (selected: UiWallet) => {
    setConnectError(null);
    setConnectingId(getWalletUniqueIdentifier(selected));
    try {
      await dAppKitInstance.connectWallet({ wallet: selected });
      setDepositStep("amount");
    } catch (err) {
      setConnectError(err instanceof Error ? err.message : "Could not connect wallet.");
    } finally {
      setConnectingId(null);
    }
  };

  const submitDeposit = async () => {
    if (!account) return;
    setTxError(null);
    setConfirming(true);
    try {
      const mist = parseAmountMist(amount);
      if (!mist) throw new Error("Enter a valid amount.");

      const tx = new Transaction();
      tx.transferObjects([coinWithBalance({ balance: mist })], agentAddress);

      const result = await dAppKitInstance.signAndExecuteTransaction({
        transaction: tx,
      });

      if ("FailedTransaction" in result && result.FailedTransaction) {
        const message =
          result.FailedTransaction.status.error?.message ?? "Transaction failed.";
        throw new Error(message);
      }

      const digest =
        "Transaction" in result && result.Transaction?.digest
          ? result.Transaction.digest
          : null;

      if (!digest) throw new Error("Transaction submitted but no digest returned.");

      setTxDigest(digest);
      setDepositStep("done");
      setBalanceRefresh((n) => n + 1);
    } catch (err) {
      setTxError(err instanceof Error ? err.message : "Transaction failed.");
    } finally {
      setConfirming(false);
    }
  };

  const walletName = wallet?.name ?? "wallet";
  const networkLabel = NETWORK_LABELS[network] ?? network;

  return (
    <>
      <section data-settings-block className="mt-10">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-[0.2em] text-[var(--hero-ink)]/40">
            <Wallet className="size-4" strokeWidth={2.5} />
            Agent wallet
          </h2>
          <span className="rounded-full border-2 border-[var(--hero-ink)] bg-[var(--hero-mint)]/15 px-3 py-1 text-xs font-bold text-[var(--hero-mint)] shadow-[2px_2px_0_var(--hero-ink)]">
            {networkLabel}
          </span>
        </div>

        <p className="mb-5 text-sm font-medium leading-relaxed text-[var(--hero-ink)]/55">
          Your agent gets its own wallet when you sign up. Fund it so it can pay,
          swap, and deploy on your behalf — send SUI to the address below, or
          deposit from a wallet you already use.
        </p>

        <div className="rounded-3xl border-2 border-[var(--hero-ink)] bg-white p-6 shadow-[5px_5px_0_var(--hero-ink)]">
          <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.12em] text-[var(--hero-ink)]/40">
                Balance
              </p>
              <p className="mt-1 font-heading text-4xl font-extrabold tracking-tight">
                <AgentBalance
                  address={agentAddress}
                  network={network}
                  refreshToken={balanceRefresh}
                />
              </p>
            </div>
            <button
              type="button"
              onClick={openDeposit}
              className="group flex shrink-0 items-center justify-center gap-2 rounded-full border-2 border-[var(--hero-ink)] bg-[var(--hero-ink)] px-5 py-3 text-sm font-bold text-[var(--hero-bg)] shadow-[4px_4px_0_var(--hero-coral)] transition-transform hover:-translate-y-0.5"
            >
              <WalletMinimal className="size-4" strokeWidth={2.5} />
              Deposit from my wallet
              <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
            </button>
          </div>

          <div className="mt-6 rounded-2xl border-2 border-dashed border-[var(--hero-ink)]/20 bg-[var(--hero-bg)] p-4">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-bold uppercase tracking-[0.12em] text-[var(--hero-ink)]/40">
                Full address
              </p>
              <button
                type="button"
                onClick={copyAddress}
                className={`flex items-center gap-1.5 rounded-full border-2 border-[var(--hero-ink)] px-3 py-1 text-xs font-bold transition-all hover:-translate-y-0.5 ${
                  copied
                    ? "bg-[var(--hero-mint)] text-white"
                    : "bg-white shadow-[2px_2px_0_var(--hero-ink)]"
                }`}
              >
                {copied ? (
                  <>
                    <Check className="size-3.5" strokeWidth={2.5} />
                    Copied
                  </>
                ) : (
                  <>
                    <Copy className="size-3.5" strokeWidth={2.5} />
                    Copy
                  </>
                )}
              </button>
            </div>
            <p className="mt-2 break-all font-mono text-sm font-semibold leading-relaxed">
              {agentAddress}
            </p>
          </div>

          <div className="mt-5 rounded-2xl border-2 border-[var(--hero-ink)]/15 bg-[var(--hero-violet)]/5 px-4 py-3">
            <p className="text-xs font-bold uppercase tracking-[0.12em] text-[var(--hero-violet)]">
              Or send SUI directly
            </p>
            <p className="mt-1 text-sm font-medium leading-relaxed text-[var(--hero-ink)]/60">
              Transfer SUI from any exchange or wallet to the address above. Your
              agent can spend it as soon as it lands — no extra setup.
            </p>
          </div>
        </div>
      </section>

      <Dialog
        open={depositOpen}
        onOpenChange={(open) => (open ? setDepositOpen(true) : closeDeposit())}
      >
        <DialogContent
          showCloseButton
          className="max-w-md rounded-3xl border-2 border-[var(--hero-ink)] bg-[var(--hero-bg)] p-0 shadow-[8px_8px_0_var(--hero-ink)] ring-0 sm:max-w-md"
        >
          <DialogHeader className="border-b-2 border-[var(--hero-ink)]/10 px-6 py-5">
            <DialogTitle className="font-heading text-xl font-extrabold tracking-tight text-[var(--hero-ink)]">
              {depositStep === "connect" && "Connect a wallet"}
              {depositStep === "amount" && "How much SUI?"}
              {depositStep === "confirm" && "Confirm deposit"}
              {depositStep === "done" && "Deposit sent"}
            </DialogTitle>
            <p className="text-sm font-medium text-[var(--hero-ink)]/55">
              {depositStep === "connect" &&
                "Pick the wallet you want to send from. This only moves funds into your agent — it does not give Radiant control of your personal wallet."}
              {depositStep === "amount" &&
                `Sending from ${walletName} to your agent wallet.`}
              {depositStep === "confirm" &&
                "Review once — your personal wallet signs the transfer."}
              {depositStep === "done" &&
                "Funds are on the way. Your balance updates when the transfer confirms."}
            </p>
          </DialogHeader>

          <div className="px-6 py-5">
            {depositStep === "connect" && (
              <div className="flex flex-col gap-3">
                {wallets.length === 0 ? (
                  <div className="rounded-2xl border-2 border-dashed border-[var(--hero-ink)]/25 bg-white px-4 py-5 text-center">
                    <p className="text-sm font-semibold text-[var(--hero-ink)]/70">
                      No Sui wallets detected
                    </p>
                    <p className="mt-2 text-xs font-medium leading-relaxed text-[var(--hero-ink)]/50">
                      Install{" "}
                      <a
                        href="https://suiwallet.com"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-bold text-[var(--hero-blue)] underline"
                      >
                        Sui Wallet
                      </a>{" "}
                      or use{" "}
                      <a
                        href="https://slush.app"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-bold text-[var(--hero-blue)] underline"
                      >
                        Slush
                      </a>
                      , then refresh this page.
                    </p>
                  </div>
                ) : (
                  wallets.map((w) => {
                    const id = getWalletUniqueIdentifier(w);
                    const isConnecting = connectingId === id;
                    const icon = walletIcon(w);
                    return (
                      <button
                        key={id}
                        type="button"
                        disabled={Boolean(connectingId)}
                        onClick={() => void handleConnectWallet(w)}
                        className="flex items-center gap-3 rounded-2xl border-2 border-[var(--hero-ink)] bg-white px-4 py-3.5 text-left shadow-[3px_3px_0_var(--hero-ink)] transition-transform hover:-translate-y-0.5 disabled:opacity-60"
                      >
                        {icon ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={icon}
                            alt=""
                            className="size-10 rounded-xl border-2 border-[var(--hero-ink)] object-cover"
                          />
                        ) : (
                          <span className="flex size-10 items-center justify-center rounded-xl border-2 border-[var(--hero-ink)] bg-[var(--hero-blue)] font-heading text-sm font-extrabold text-white">
                            {w.name[0]}
                          </span>
                        )}
                        <span className="flex-1 text-sm font-bold">{w.name}</span>
                        {isConnecting && (
                          <Loader2 className="size-4 animate-spin text-[var(--hero-ink)]/50" />
                        )}
                      </button>
                    );
                  })
                )}
                {connectError && (
                  <p className="rounded-xl border-2 border-[var(--hero-coral)]/30 bg-[var(--hero-coral)]/10 px-3 py-2 text-xs font-semibold text-[var(--hero-coral)]">
                    {connectError}
                  </p>
                )}
              </div>
            )}

            {depositStep === "amount" && account && (
              <div className="flex flex-col gap-4">
                <div className="rounded-2xl border-2 border-dashed border-[var(--hero-ink)]/20 px-4 py-3">
                  <p className="text-xs font-bold uppercase tracking-[0.12em] text-[var(--hero-ink)]/40">
                    Connected
                  </p>
                  <p className="mt-1 text-sm font-bold">{walletName}</p>
                  <p className="font-mono text-xs font-semibold text-[var(--hero-ink)]/55">
                    {formatAddress(account.address)}
                    <ConnectedBalance
                      address={account.address}
                      network={network}
                      refreshToken={balanceRefresh}
                    />
                  </p>
                </div>
                <label className="flex flex-col gap-2">
                  <span className="text-xs font-bold uppercase tracking-[0.12em] text-[var(--hero-ink)]/40">
                    Amount (SUI)
                  </span>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="e.g. 0.1"
                    className="rounded-2xl border-2 border-[var(--hero-ink)] bg-white px-4 py-3 font-mono text-lg font-semibold focus:outline-none focus:ring-2 focus:ring-[var(--hero-blue)]"
                  />
                </label>
                <p className="text-xs font-medium text-[var(--hero-ink)]/45">
                  To{" "}
                  <span className="font-mono font-semibold text-[var(--hero-ink)]/70">
                    {agentShort}
                  </span>
                </p>
                <button
                  type="button"
                  disabled={!parseAmountMist(amount)}
                  onClick={() => setDepositStep("confirm")}
                  className="flex items-center justify-center gap-2 rounded-full border-2 border-[var(--hero-ink)] bg-[var(--hero-ink)] py-3 text-sm font-bold text-[var(--hero-bg)] shadow-[4px_4px_0_var(--hero-coral)] transition-transform hover:-translate-y-0.5 disabled:opacity-40 disabled:shadow-none disabled:hover:translate-y-0"
                >
                  Continue
                  <ArrowRight className="size-4" />
                </button>
              </div>
            )}

            {depositStep === "confirm" && (
              <div className="flex flex-col gap-4">
                <div className="rounded-2xl border-2 border-dashed border-[var(--hero-ink)]/20 px-4 py-3">
                  <p className="text-xs font-bold uppercase tracking-[0.12em] text-[var(--hero-ink)]/40">
                    You send
                  </p>
                  <p className="mt-1 font-heading text-2xl font-extrabold">
                    {amount} SUI
                  </p>
                </div>
                <div className="rounded-2xl border-2 border-dashed border-[var(--hero-ink)]/20 px-4 py-3">
                  <p className="text-xs font-bold uppercase tracking-[0.12em] text-[var(--hero-ink)]/40">
                    From
                  </p>
                  <p className="mt-1 text-sm font-bold">{walletName}</p>
                  {account && (
                    <p className="font-mono text-xs text-[var(--hero-ink)]/55">
                      {formatAddress(account.address)}
                    </p>
                  )}
                </div>
                {txError && (
                  <p className="rounded-xl border-2 border-[var(--hero-coral)]/30 bg-[var(--hero-coral)]/10 px-3 py-2 text-xs font-semibold text-[var(--hero-coral)]">
                    {txError}
                  </p>
                )}
                <button
                  type="button"
                  disabled={confirming}
                  onClick={() => void submitDeposit()}
                  className="flex items-center justify-center gap-2 rounded-full border-2 border-[var(--hero-ink)] bg-[var(--hero-mint)] py-3 text-sm font-bold text-white shadow-[4px_4px_0_var(--hero-ink)] transition-transform hover:-translate-y-0.5 disabled:opacity-70"
                >
                  {confirming ? (
                    <>
                      <Loader2 className="size-4 animate-spin" />
                      Signing…
                    </>
                  ) : (
                    "Sign & deposit"
                  )}
                </button>
              </div>
            )}

            {depositStep === "done" && (
              <div className="flex flex-col items-center gap-4 py-2 text-center">
                <span className="flex size-14 items-center justify-center rounded-full border-2 border-[var(--hero-ink)] bg-[var(--hero-mint)] text-white shadow-[4px_4px_0_var(--hero-ink)]">
                  <Check className="size-7" strokeWidth={2.5} />
                </span>
                <p className="text-sm font-medium text-[var(--hero-ink)]/60">
                  {amount} SUI is heading to your agent wallet.
                </p>
                {txDigest && (
                  <a
                    href={explorerTxUrl(network, txDigest)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 font-mono text-xs font-bold text-[var(--hero-blue)] hover:underline"
                  >
                    View on explorer
                    <ExternalLink className="size-3.5" />
                  </a>
                )}
                <button
                  type="button"
                  onClick={closeDeposit}
                  className="rounded-full border-2 border-[var(--hero-ink)] bg-white px-6 py-2.5 text-sm font-bold shadow-[3px_3px_0_var(--hero-ink)] transition-transform hover:-translate-y-0.5"
                >
                  Done
                </button>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
