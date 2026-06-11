"use client";

import { useState } from "react";
import { ArrowRight, Check, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatChainAddress } from "@/lib/chain-meta";
import {
  connectInjectedSolana,
  parseDecimalToAtomic,
  sendInjectedSolanaTransfer,
} from "@/lib/personal-wallet";

type Step = "connect" | "amount" | "confirm" | "done";

type SolanaDepositDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  agentAddress: string;
  onSuccess: () => void;
};

export function SolanaDepositDialog({
  open,
  onOpenChange,
  agentAddress,
  onSuccess,
}: SolanaDepositDialogProps) {
  const [step, setStep] = useState<Step>("connect");
  const [fromAddress, setFromAddress] = useState<string | null>(null);
  const [amount, setAmount] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [signature, setSignature] = useState<string | null>(null);

  const agentShort = formatChainAddress("solana", agentAddress);

  const reset = () => {
    setFromAddress(null);
    setAmount("");
    setConfirming(false);
    setError(null);
    setSignature(null);
  };

  const close = () => {
    onOpenChange(false);
    setStep("connect");
    setTimeout(reset, 200);
  };

  const handleOpen = (next: boolean) => {
    if (!next) {
      close();
      return;
    }
    reset();
    setStep("connect");
    onOpenChange(true);
  };

  const connect = async () => {
    setError(null);
    setConfirming(true);
    try {
      const address = await connectInjectedSolana();
      setFromAddress(address);
      setStep("amount");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not connect wallet.");
    } finally {
      setConfirming(false);
    }
  };

  const submit = async () => {
    if (!fromAddress) return;
    setError(null);
    setConfirming(true);
    try {
      const lamports = parseDecimalToAtomic(amount, 9);
      if (!lamports) throw new Error("Enter a valid SOL amount.");

      const sig = await sendInjectedSolanaTransfer({
        from: fromAddress,
        to: agentAddress,
        amountLamports: lamports,
      });

      setSignature(sig);
      setStep("done");
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Transaction failed.");
    } finally {
      setConfirming(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpen}>
      <DialogContent
        showCloseButton
        className="max-w-md rounded-3xl border-2 border-[var(--hero-ink)] bg-[var(--hero-bg)] p-0 shadow-[8px_8px_0_var(--hero-ink)] ring-0 sm:max-w-md"
      >
        <DialogHeader className="border-b-2 border-[var(--hero-ink)]/10 px-6 py-5">
          <DialogTitle className="font-heading text-xl font-extrabold tracking-tight">
            {step === "connect" && "Connect Solana wallet"}
            {step === "amount" && "Deposit SOL"}
            {step === "confirm" && "Confirm deposit"}
            {step === "done" && "Deposit sent"}
          </DialogTitle>
          <p className="text-sm font-medium text-[var(--hero-ink)]/55">
            Phantom, Brave, or any injected Solana wallet via `window.solana`.
          </p>
        </DialogHeader>

        <div className="px-6 py-5">
          {step === "connect" && (
            <div className="flex flex-col gap-3">
              <button
                type="button"
                disabled={confirming}
                onClick={() => void connect()}
                className="rounded-full border-2 border-[var(--hero-ink)] bg-[var(--hero-ink)] py-3 text-sm font-bold text-[var(--hero-bg)] shadow-[4px_4px_0_var(--hero-coral)] disabled:opacity-60"
              >
                {confirming ? (
                  <span className="inline-flex items-center gap-2">
                    <Loader2 className="size-4 animate-spin" />
                    Connecting…
                  </span>
                ) : (
                  "Connect browser wallet"
                )}
              </button>
              {error && (
                <p className="rounded-xl border-2 border-[var(--hero-coral)]/30 bg-[var(--hero-coral)]/10 px-3 py-2 text-xs font-semibold text-[var(--hero-coral)]">
                  {error}
                </p>
              )}
            </div>
          )}

          {step === "amount" && fromAddress && (
            <div className="flex flex-col gap-4">
              <p className="font-mono text-xs text-[var(--hero-ink)]/55">
                From {formatChainAddress("solana", fromAddress)}
              </p>
              <label className="flex flex-col gap-2">
                <span className="text-xs font-bold uppercase tracking-[0.12em] text-[var(--hero-ink)]/40">
                  Amount (SOL)
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
              <p className="text-xs text-[var(--hero-ink)]/45">
                To <span className="font-mono font-semibold">{agentShort}</span>
              </p>
              <button
                type="button"
                disabled={!parseDecimalToAtomic(amount, 9)}
                onClick={() => setStep("confirm")}
                className="flex items-center justify-center gap-2 rounded-full border-2 border-[var(--hero-ink)] bg-[var(--hero-ink)] py-3 text-sm font-bold text-[var(--hero-bg)] disabled:opacity-40"
              >
                Continue
                <ArrowRight className="size-4" />
              </button>
            </div>
          )}

          {step === "confirm" && (
            <div className="flex flex-col gap-4">
              <p className="font-heading text-2xl font-extrabold">{amount} SOL</p>
              {error && (
                <p className="rounded-xl border-2 border-[var(--hero-coral)]/30 bg-[var(--hero-coral)]/10 px-3 py-2 text-xs font-semibold text-[var(--hero-coral)]">
                  {error}
                </p>
              )}
              <button
                type="button"
                disabled={confirming}
                onClick={() => void submit()}
                className="rounded-full border-2 border-[var(--hero-ink)] bg-[var(--hero-mint)] py-3 text-sm font-bold text-white disabled:opacity-70"
              >
                {confirming ? "Signing…" : "Sign & deposit"}
              </button>
            </div>
          )}

          {step === "done" && (
            <div className="flex flex-col items-center gap-4 text-center">
              <span className="flex size-14 items-center justify-center rounded-full border-2 border-[var(--hero-ink)] bg-[var(--hero-mint)] text-white">
                <Check className="size-7" />
              </span>
              {signature && (
                <p className="break-all font-mono text-xs text-[var(--hero-ink)]/60">{signature}</p>
              )}
              <button type="button" onClick={close} className="rounded-full border-2 border-[var(--hero-ink)] bg-white px-6 py-2.5 text-sm font-bold">
                Done
              </button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
