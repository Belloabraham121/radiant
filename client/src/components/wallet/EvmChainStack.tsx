"use client";

import { useState, type CSSProperties } from "react";
import type { EvmNetworkMeta } from "@/lib/evm-chains";
import { getEvmNetworkIconUrl } from "@/lib/chain-icons";

type EvmChainStackProps = {
  networks: EvmNetworkMeta[];
  size?: number;
};

/** Each icon overlaps the previous by ~50%, left to right on one horizontal line. */
const ICON_OVERLAP_RATIO = 0.5;

function stackedIconWidth(iconSize: number, count: number): number {
  if (count <= 1) return iconSize;
  return iconSize + (count - 1) * iconSize * ICON_OVERLAP_RATIO;
}

function NetworkIcon({
  chainId,
  label,
  size,
  className,
  style,
}: {
  chainId: number;
  label: string;
  size: number;
  className?: string;
  style?: CSSProperties;
}) {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <span
        className={`flex items-center justify-center rounded-full border-2 border-white bg-[var(--hero-ink)] font-heading text-[10px] font-extrabold text-white ${className ?? ""}`}
        style={{ width: size, height: size, ...style }}
        aria-hidden
      >
        {label.slice(0, 1)}
      </span>
    );
  }

  return (
    <img
      src={getEvmNetworkIconUrl(chainId)}
      alt=""
      width={size}
      height={size}
      loading="lazy"
      decoding="async"
      onError={() => setFailed(true)}
      className={`rounded-full border-2 border-white bg-white object-cover ${className ?? ""}`}
      style={{ width: size, height: size, ...style }}
    />
  );
}

/** EVM network logos in a horizontal overlapping stack, with hover popup listing supported chains. */
export function EvmChainStack({ networks, size = 32 }: EvmChainStackProps) {
  if (networks.length === 0) {
    return null;
  }

  const stackWidth = stackedIconWidth(size, networks.length);
  const overlapOffset = size * ICON_OVERLAP_RATIO;

  return (
    <div className="group relative shrink-0">
      <div
        className="flex items-center"
        style={{ width: stackWidth, height: size }}
        role="img"
        aria-label={`Supported on ${networks.map((n) => n.label).join(", ")}`}
      >
        {networks.map((network, index) => (
          <NetworkIcon
            key={network.chainId}
            chainId={network.chainId}
            label={network.label}
            size={size}
            className="relative shrink-0"
            style={{
              marginLeft: index === 0 ? 0 : -overlapOffset,
              zIndex: networks.length - index,
            }}
          />
        ))}
      </div>

      <div
        role="tooltip"
        className="pointer-events-none absolute bottom-full left-0 z-50 mb-2 hidden min-w-[10rem] rounded-xl border-2 border-[var(--hero-ink)] bg-white px-3 py-2 shadow-[3px_3px_0_var(--hero-ink)] group-hover:block group-focus-within:block"
      >
        <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--hero-ink)]/45">
          Supported chains
        </p>
        <ul className="mt-1.5 flex flex-col gap-1">
          {networks.map((network) => (
            <li
              key={network.chainId}
              className="flex items-center gap-2 text-xs font-semibold text-[var(--hero-ink)]"
            >
              <NetworkIcon
                chainId={network.chainId}
                label={network.label}
                size={18}
              />
              {network.label}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
