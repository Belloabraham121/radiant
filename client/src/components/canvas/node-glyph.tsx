import type { ComponentType } from "react";
import { Search } from "lucide-react";
import { NODE_ICONS } from "./node-catalog";

type GlyphProps = { className?: string };

/** Official Polymarket app icon (full-bleed; fills its badge). */
export function PolymarketLogo({ className }: GlyphProps) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/logos/polymarket.png"
      alt="Polymarket"
      draggable={false}
      className={className}
    />
  );
}

export function LifiLogo({ className }: GlyphProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" aria-hidden="true">
      <defs>
        <linearGradient
          id="radiant-lifi-grad"
          x1="3"
          y1="3"
          x2="21"
          y2="21"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#FF1CB6" />
          <stop offset="1" stopColor="#FF8A00" />
        </linearGradient>
      </defs>
      <circle cx="12" cy="12" r="8" stroke="url(#radiant-lifi-grad)" strokeWidth="3" />
      <circle cx="12" cy="12" r="2.6" fill="url(#radiant-lifi-grad)" />
    </svg>
  );
}

/** Official Limitless mark (transparent glyph; sits on a white badge). */
export function LimitlessLogo({ className }: GlyphProps) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/logos/limitless.svg"
      alt="Limitless"
      draggable={false}
      className={className}
    />
  );
}

const BRAND_LOGOS: Record<string, ComponentType<GlyphProps>> = {
  polymarket: PolymarketLogo,
  lifi: LifiLogo,
  limitless: LimitlessLogo,
};

export function isBrandIcon(icon: string): boolean {
  return icon in BRAND_LOGOS;
}

/** Image-based logos render full-bleed (fill the badge); SVG marks don't. */
const IMAGE_LOGOS = new Set(["polymarket"]);
export function isImageLogo(icon: string): boolean {
  return IMAGE_LOGOS.has(icon);
}

/** Render a brand logo when the icon key is a brand, else a lucide icon. */
export function NodeGlyph({ icon, className }: { icon: string; className?: string }) {
  const Brand = BRAND_LOGOS[icon];
  if (Brand) {
    return <Brand className={className} />;
  }
  const Lucide = NODE_ICONS[icon] ?? Search;
  return <Lucide className={className} strokeWidth={2.5} />;
}
