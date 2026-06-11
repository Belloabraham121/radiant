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
import { ArrowRight, Check, ExternalLink, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { dAppKit } from "@/lib/dapp-kit";
import { mistToSui, type SuiNetwork } from "@/lib/sui-config";

type DepositStep = "connect" | "amount" | "confirm" | "done";

type SuiDepositDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  agentAddress: string;
  agentShort: string;
  onSuccess: () => void;
};

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

export function SuiDepositDialog({
  open,
  onOpenChange,
  agentAddress,
  agentShort,
  onSuccess,
}: SuiDepositDialogProps) {
  const dAppKitInstance = useDAppKit();
  const wallets = useWallets();
  const connection = useWalletConnection();
  const account = useCurrentAccount();
  const wallet = useCurrentWallet();
  const network = useCurrentNetwork() as SuiNetwork;

  const [step, setStep] = useState<DepositStep>("connect");
  const [amount, setAmount] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [connectingId, setConnectingId] = useState<string | null>(null);
  const [connectError, setConnectError] = useState<string | null>(null);
  const [txError, setTxError] = useState<string | null>(null);
  const [txDigest, setTxDigest] = useState<string | null>(null);
  const [balanceRefresh, setBalanceRefresh] = useState(0);

  const reset = () => {
    setAmount("");
    setConfirming(false);
    setConnectingId(null);
    setConnectError(null);
    setTxError(null);
    setTxDigest(null);
  };

  const close = () => {
    onOpenChange(false);
    setStep("connect");
    setTimeout(reset, 200);
  };

  const handleOpen = (next: boolean) => {
    if (next) {
      reset();
      setStep(connection.isConnected ? "amount" : "connect");
      onOpenChange(true);
      return;
    }
    close();
  };

  const handleConnectWallet = async (selected: UiWallet) => {
    setConnectError(null);
    setConnectingId(getWalletUniqueIdentifier(selected));
    try {
      await dAppKitInstance.connectWallet({ wallet: selected });
      setStep("amount");
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

      const result = await dAppKitInstance.signAndExecuteTransaction({ transaction: tx });

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
      setStep("done");
      setBalanceRefresh((n) => n + 1);
      onSuccess();
    } catch (err) {
      setTxError(err instanceof Error ? err.message : "Transaction failed.");
    } finally {
      setConfirming(false);
    }
  };

  const walletName = wallet?.name ?? "wallet";

  return (
    <Dialog open={open} onOpenChange={handleOpen}>
      <DialogContent
        showCloseButton
        className="max-w-md rounded-3xl border-2 border-[var(--hero-ink)] bg-[var(--hero-bg)] p-0 shadow-[8px_8px_0_var(--hero-ink)] ring-0 sm:max-w-md"
      >
        <DialogHeader className="border-b-2 border-[var(--hero-ink)]/10 px-6 py-5">
          <DialogTitle className="font-heading text-xl font-extrabold tracking-tight text-[var(--hero-ink)]">
            {step === "connect" && "Connect Sui wallet"}
            {step === "amount" && "Deposit SUI"}
            {step === "confirm" && "Confirm deposit"}
            {step === "done" && "Deposit sent"}
          </DialogTitle>
          <p className="text-sm font-medium text-[var(--hero-ink)]/55">
            Uses dapp-kit — Sui Wallet, Slush, Brave, etc. Funds go to your agent only.
          </p>
        </DialogHeader>

        <div className="px-6 py-5">
          {step === "connect" && (
            <div className="flex flex-col gap-3">
              {wallets.length === 0 ? (
                <p className="rounded-2xl border-2 border-dashed border-[var(--hero-ink)]/25 bg-white px-4 py-5 text-center text-sm font-medium text-[var(--hero-ink)]/60">
                  No Sui wallets detected. Install Sui Wallet or Slush, then refresh.
                </p>
              ) : (
                wallets.map((w) => {
                  const id = getWalletUniqueIdentifier(w);
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
                        <img src={icon} alt="" className="size-10 rounded-xl border-2 border-[var(--hero-ink)] object-cover" />
                      ) : (
                        <span className="flex size-10 items-center justify-center rounded-xl border-2 border-[var(--hero-ink)] bg-[var(--hero-blue)] font-heading text-sm font-extrabold text-white">
                          {w.name[0]}
                        </span>
                      )}
                      <span className="flex-1 text-sm font-bold">{w.name}</span>
                      {connectingId === id && (
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

          {step === "amount" && account && (
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
                To <span className="font-mono font-semibold">{agentShort}</span>
              </p>
              <button
                type="button"
                disabled={!parseAmountMist(amount)}
                onClick={() => setStep("confirm")}
                className="flex items-center justify-center gap-2 rounded-full border-2 border-[var(--hero-ink)] bg-[var(--hero-ink)] py-3 text-sm font-bold text-[var(--hero-bg)] shadow-[4px_4px_0_var(--hero-coral)] transition-transform hover:-translate-y-0.5 disabled:opacity-40"
              >
                Continue
                <ArrowRight className="size-4" />
              </button>
            </div>
          )}

          {step === "confirm" && (
            <div className="flex flex-col gap-4">
              <div className="rounded-2xl border-2 border-dashed border-[var(--hero-ink)]/20 px-4 py-3">
                <p className="text-xs font-bold uppercase tracking-[0.12em] text-[var(--hero-ink)]/40">
                  You send
                </p>
                <p className="mt-1 font-heading text-2xl font-extrabold">{amount} SUI</p>
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
                className="flex items-center justify-center gap-2 rounded-full border-2 border-[var(--hero-ink)] bg-[var(--hero-mint)] py-3 text-sm font-bold text-white shadow-[4px_4px_0_var(--hero-ink)] disabled:opacity-70"
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

          {step === "done" && (
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
                onClick={close}
                className="rounded-full border-2 border-[var(--hero-ink)] bg-white px-6 py-2.5 text-sm font-bold shadow-[3px_3px_0_var(--hero-ink)]"
              >
                Done
              </button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
