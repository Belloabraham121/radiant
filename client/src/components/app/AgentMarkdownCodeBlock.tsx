"use client";

import { isValidElement, useState, type ReactNode } from "react";
import { Check, Copy } from "lucide-react";

function extractCodeText(children: ReactNode): string {
  if (typeof children === "string") {
    return children.replace(/\n$/, "");
  }
  if (Array.isArray(children)) {
    return children.map((child) => extractCodeText(child)).join("");
  }
  if (isValidElement<{ children?: ReactNode }>(children)) {
    return extractCodeText(children.props.children);
  }
  return String(children ?? "");
}

function languageLabel(className?: string): string | null {
  const match = /language-([\w-]+)/.exec(className ?? "");
  return match?.[1] ?? null;
}

type AgentMarkdownCodeBlockProps = {
  className?: string;
  children: ReactNode;
};

/** Fenced code block with copy — backticks are stripped by the markdown parser. */
export function AgentMarkdownCodeBlock({
  className,
  children,
}: AgentMarkdownCodeBlockProps) {
  const [copied, setCopied] = useState(false);
  const code = extractCodeText(children);
  const lang = languageLabel(className);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard unavailable
    }
  };

  return (
    <div className="my-2.5 overflow-hidden rounded-2xl border-2 border-[var(--hero-ink)] bg-[var(--hero-bg)] shadow-[3px_3px_0_var(--hero-ink)]">
      <div className="flex items-center justify-between gap-2 border-b-2 border-[var(--hero-ink)]/15 bg-white/60 px-3 py-1.5">
        <span className="truncate font-mono text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--hero-ink)]/45">
          {lang ?? "code"}
        </span>
        <button
          type="button"
          onClick={() => void copy()}
          aria-label="Copy code"
          title="Copy code"
          className={`inline-flex shrink-0 items-center gap-1 rounded-lg border-2 px-2 py-0.5 text-[10px] font-bold transition-all hover:-translate-y-0.5 ${
            copied
              ? "border-[var(--hero-mint)] bg-[var(--hero-mint)]/15 text-[var(--hero-mint)]"
              : "border-[var(--hero-ink)]/20 text-[var(--hero-ink)]/55 hover:border-[var(--hero-ink)]/35 hover:text-[var(--hero-ink)]"
          }`}
        >
          {copied ? (
            <Check className="size-3" strokeWidth={2.5} />
          ) : (
            <Copy className="size-3" strokeWidth={2.5} />
          )}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre className="max-h-80 overflow-x-auto overflow-y-auto px-3.5 py-3">
        <code className="block font-mono text-[0.8rem] font-semibold leading-relaxed text-[var(--hero-ink)]">
          {code}
        </code>
      </pre>
    </div>
  );
}
