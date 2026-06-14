"use client";

import { useMemo } from "react";
import Markdown from "react-markdown";
import type { Components } from "react-markdown";
import { linkTransactionDigestsInMarkdown } from "@/lib/link-transaction-digests";

const markdownComponents: Components = {
  p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
  strong: ({ children }) => (
    <strong className="font-extrabold text-[var(--hero-ink)]">{children}</strong>
  ),
  em: ({ children }) => <em className="italic text-[var(--hero-ink)]/85">{children}</em>,
  ol: ({ children }) => (
    <ol className="my-2 list-decimal space-y-1.5 pl-5 marker:font-bold marker:text-[var(--hero-ink)]/55">
      {children}
    </ol>
  ),
  ul: ({ children }) => (
    <ul className="my-2 list-disc space-y-1.5 pl-5 marker:text-[var(--hero-amber)]">
      {children}
    </ul>
  ),
  li: ({ children }) => <li className="pl-0.5">{children}</li>,
  h1: ({ children }) => (
    <h3 className="mb-2 font-heading text-base font-extrabold tracking-tight">{children}</h3>
  ),
  h2: ({ children }) => (
    <h3 className="mb-2 font-heading text-base font-extrabold tracking-tight">{children}</h3>
  ),
  h3: ({ children }) => (
    <h4 className="mb-1.5 font-heading text-sm font-extrabold tracking-tight">{children}</h4>
  ),
  a: ({ href, children }) => (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="font-bold text-[var(--hero-coral)] underline underline-offset-2"
    >
      {children}
    </a>
  ),
  code: ({ children }) => (
    <code className="rounded-md bg-[var(--hero-bg)] px-1.5 py-0.5 font-mono text-[0.85em] font-semibold text-[var(--hero-ink)]">
      {children}
    </code>
  ),
};

export function AgentMessageMarkdown({ text }: { text: string }) {
  const linkedText = useMemo(() => linkTransactionDigestsInMarkdown(text), [text]);

  return (
    <div className="agent-markdown [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
      <Markdown components={markdownComponents}>{linkedText}</Markdown>
    </div>
  );
}
