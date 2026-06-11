"use client";

import { useState } from "react";
import {
  ArrowRight,
  Check,
  Copy,
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
import { USER } from "@/lib/app-data";

const PERSONAL_WALLETS = [
  { id: "slush", name: "Slush", accent: "var(--hero-blue)" },
  { id: "sui", name: "Sui Wallet", accent: "var(--hero-coral)" },
  { id: "phantom", name: "Phantom", accent: "var(--hero-violet)" },
] as const;

type DepositStep = "connect" | "amount" | "confirm" | "done";

export function AgentWalletSection() {
  const [copied, setCopied] = useState(false);
  const [depositOpen, setDepositOpen] = useState(false);
  const [depositStep, setDepositStep] = useState<DepositStep>("connect");
  const [selectedWallet, setSelectedWallet] = useState<string | null>(null);
  const [amount, setAmount] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [balance, setBalance] = useState(USER.balanceSui);

  const copyAddress = async () => {
    try {
      await navigator.clipboard.writeText(USER.walletFull);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard unavailable
    }
  };

  const resetDeposit = () => {
    setDepositStep("connect");
    setSelectedWallet(null);
    setAmount("");
    setConfirming(false);
  };

  const closeDeposit = () => {
    setDepositOpen(false);
    setTimeout(resetDeposit, 200);
  };

  const connectWallet = (id: string) => {
    setSelectedWallet(id);
    setDepositStep("amount");
  };

  const submitDeposit = () => {
    setConfirming(true);
    setTimeout(() => {
      const parsed = parseFloat(amount);
      if (!Number.isNaN(parsed) && parsed > 0) {
        setBalance((b) => Math.round((b + parsed) * 100) / 100);
      }
      setConfirming(false);
      setDepositStep("done");
    }, 1200);
  };

  const walletName =
    PERSONAL_WALLETS.find((w) => w.id === selectedWallet)?.name ?? "wallet";

  return (
    <>
      <section data-settings-block className="mt-10">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-[0.2em] text-[var(--hero-ink)]/40">
            <Wallet className="size-4" strokeWidth={2.5} />
            Agent wallet
          </h2>
          <span className="rounded-full border-2 border-[var(--hero-ink)] bg-[var(--hero-mint)]/15 px-3 py-1 text-xs font-bold text-[var(--hero-mint)] shadow-[2px_2px_0_var(--hero-ink)]">
            {USER.network}
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
                {balance.toFixed(2)}{" "}
                <span className="text-xl text-[var(--hero-ink)]/45">SUI</span>
              </p>
            </div>
            <button
              type="button"
              onClick={() => setDepositOpen(true)}
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
              {USER.walletFull}
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
                {PERSONAL_WALLETS.map((w) => (
                  <button
                    key={w.id}
                    type="button"
                    onClick={() => connectWallet(w.id)}
                    className="flex items-center gap-3 rounded-2xl border-2 border-[var(--hero-ink)] bg-white px-4 py-3.5 text-left shadow-[3px_3px_0_var(--hero-ink)] transition-transform hover:-translate-y-0.5"
                  >
                    <span
                      className="flex size-10 items-center justify-center rounded-xl border-2 border-[var(--hero-ink)] font-heading text-sm font-extrabold text-white"
                      style={{ backgroundColor: w.accent }}
                    >
                      {w.name[0]}
                    </span>
                    <span className="text-sm font-bold">{w.name}</span>
                  </button>
                ))}
              </div>
            )}

            {depositStep === "amount" && (
              <div className="flex flex-col gap-4">
                <label className="flex flex-col gap-2">
                  <span className="text-xs font-bold uppercase tracking-[0.12em] text-[var(--hero-ink)]/40">
                    Amount (SUI)
                  </span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="e.g. 25"
                    className="rounded-2xl border-2 border-[var(--hero-ink)] bg-white px-4 py-3 font-mono text-lg font-semibold focus:outline-none focus:ring-2 focus:ring-[var(--hero-blue)]"
                  />
                </label>
                <p className="text-xs font-medium text-[var(--hero-ink)]/45">
                  To{" "}
                  <span className="font-mono font-semibold text-[var(--hero-ink)]/70">
                    {USER.wallet}
                  </span>
                </p>
                <button
                  type="button"
                  disabled={!amount || parseFloat(amount) <= 0}
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
                </div>
                <button
                  type="button"
                  disabled={confirming}
                  onClick={submitDeposit}
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
