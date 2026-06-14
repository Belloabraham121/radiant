"use client";

import { useState } from "react";
import { Check, Copy, ExternalLink, Globe } from "lucide-react";

export function ArtifactLiveSiteBanner({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="mx-4 mb-2 space-y-2 rounded-2xl border-2 border-[var(--hero-mint)]/30 bg-[var(--hero-mint)]/10 px-4 py-3">
      <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-[var(--hero-mint)]">
        <Globe className="size-3.5" strokeWidth={2.5} aria-hidden />
        Published on Walrus
      </div>
      <p className="break-all text-xs font-semibold text-[var(--hero-ink)]/70">{url}</p>
      <div className="flex flex-wrap items-center gap-2">
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 rounded-xl border-2 border-[var(--hero-ink)] bg-[var(--hero-mint)]/20 px-3 py-1.5 text-xs font-bold text-[var(--hero-ink)] hover:bg-[var(--hero-mint)]/30"
        >
          Open site
          <ExternalLink className="size-3" strokeWidth={2.5} aria-hidden />
        </a>
        <button
          type="button"
          onClick={() => void handleCopy()}
          className="inline-flex items-center gap-1.5 rounded-xl border-2 border-[var(--hero-ink)]/20 px-3 py-1.5 text-xs font-bold text-[var(--hero-ink)]/70 hover:border-[var(--hero-ink)]/40"
        >
          {copied ? (
            <Check className="size-3" strokeWidth={2.5} aria-hidden />
          ) : (
            <Copy className="size-3" strokeWidth={2.5} aria-hidden />
          )}
          {copied ? "Copied" : "Copy URL"}
        </button>
      </div>
    </div>
  );
}
