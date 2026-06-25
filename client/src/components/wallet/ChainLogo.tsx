"use client";

import { useState } from "react";
import type { AgentChainId } from "@/lib/agent-chains";
import { getChainIconUrl } from "@/lib/chain-icons";
import { getChainMeta } from "@/lib/chain-meta";

const CHAIN_ACCENT: Record<AgentChainId, string> = {
  sui: "var(--hero-blue)",
  ethereum: "var(--hero-ink)",
  solana: "var(--hero-violet)",
  stellar: "var(--hero-amber)",
};

type ChainLogoProps = {
  chainId: AgentChainId;
  size?: number;
  className?: string;
};

export function ChainLogo({ chainId, size = 36, className = "" }: ChainLogoProps) {
  const [failed, setFailed] = useState(false);
  const meta = getChainMeta(chainId);
  const accent = CHAIN_ACCENT[chainId];

  if (failed) {
    return (
      <span
        className={`flex shrink-0 items-center justify-center rounded-full border-2 border-[var(--hero-ink)] font-heading text-xs font-extrabold text-white ${className}`}
        style={{ width: size, height: size, backgroundColor: accent }}
        aria-hidden
      >
        {meta.label.slice(0, 1)}
      </span>
    );
  }

  return (
    <img
      src={getChainIconUrl(chainId)}
      alt=""
      width={size}
      height={size}
      loading="lazy"
      decoding="async"
      onError={() => setFailed(true)}
      className={`shrink-0 rounded-full border-2 border-[var(--hero-ink)]/15 bg-white object-cover ${className}`}
      style={{ width: size, height: size }}
    />
  );
}
