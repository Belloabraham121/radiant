"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatChainAddress } from "@/lib/chain-meta";

type StellarDepositDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  agentAddress: string;
};

export function StellarDepositDialog({
  open,
  onOpenChange,
  agentAddress,
}: StellarDepositDialogProps) {
  const [copied, setCopied] = useState(false);
  const short = formatChainAddress("stellar", agentAddress);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(agentAddress);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard unavailable
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md border-2 border-[var(--hero-ink)]">
        <DialogHeader>
          <DialogTitle className="font-heading text-lg font-extrabold">
            Deposit XLM to agent wallet
          </DialogTitle>
        </DialogHeader>
        <p className="text-sm font-medium text-[var(--hero-ink)]/60">
          Send XLM from any Stellar wallet (Freighter, Lobstr, exchange withdrawal) to
          this address on Stellar mainnet.
        </p>
        <div className="rounded-2xl border-2 border-dashed border-[var(--hero-ink)]/20 bg-[var(--hero-bg)] px-3 py-3">
          <p className="break-all font-mono text-xs font-semibold text-[var(--hero-ink)]/80">
            {agentAddress}
          </p>
          <p className="mt-1 text-[10px] font-medium text-[var(--hero-ink)]/45">{short}</p>
        </div>
        <button
          type="button"
          onClick={() => void copy()}
          className="inline-flex w-full items-center justify-center gap-2 rounded-full border-2 border-[var(--hero-ink)] bg-[var(--hero-ink)] px-4 py-2.5 text-sm font-bold text-[var(--hero-bg)]"
        >
          {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
          {copied ? "Copied" : "Copy address"}
        </button>
      </DialogContent>
    </Dialog>
  );
}
