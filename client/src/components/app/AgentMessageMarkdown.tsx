"use client";

import { isValidElement, useMemo, type ReactNode } from "react";
import Markdown from "react-markdown";
import type { Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { AgentMarkdownCodeBlock } from "@/components/app/AgentMarkdownCodeBlock";
import { linkTransactionDigestsInMarkdown } from "@/lib/link-transaction-digests";

function isFencedCodeBlock(className?: string): boolean {
  return /language-[\w-]+/.test(className ?? "");
}

function allowedMarkdownUrl(url: string): string {
  const trimmed = url.trim();
  if (trimmed.startsWith("/") && !trimmed.startsWith("//")) {
    return trimmed;
  }

  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol === "http:" || parsed.protocol === "https:") {
      return parsed.toString();
    }
  } catch {
    return "";
  }

  return "";
}

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
  a: ({ href, children }) => {
    const safeHref = href ? allowedMarkdownUrl(href) : "";
    if (!safeHref) {
      return <span>{children}</span>;
    }
    return (
      <a
        href={safeHref}
        target="_blank"
        rel="noopener noreferrer"
        className="font-bold text-[var(--hero-coral)] underline underline-offset-2"
      >
        {children}
      </a>
    );
  },
  blockquote: ({ children }) => (
    <blockquote className="my-2 border-l-4 border-[var(--hero-amber)] pl-3 text-[var(--hero-ink)]/75">
      {children}
    </blockquote>
  ),
  pre: ({ children }) => {
    if (isValidElement<{ className?: string; children?: ReactNode }>(children)) {
      return (
        <AgentMarkdownCodeBlock className={children.props.className}>
          {children.props.children}
        </AgentMarkdownCodeBlock>
      );
    }
    return <pre>{children}</pre>;
  },
  code: ({ className, children, ...props }) => {
    if (isFencedCodeBlock(className)) {
      return (
        <code className={className} {...props}>
          {children}
        </code>
      );
    }

    return (
      <code
        className="rounded-md bg-[var(--hero-bg)] px-1.5 py-0.5 font-mono text-[0.85em] font-semibold text-[var(--hero-ink)]"
        {...props}
      >
        {children}
      </code>
    );
  },
};

export function AgentMessageMarkdown({ text }: { text: string }) {
  const linkedText = useMemo(() => linkTransactionDigestsInMarkdown(text), [text]);

  return (
    <div className="agent-markdown [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
      <Markdown
        remarkPlugins={[remarkGfm]}
        components={markdownComponents}
        urlTransform={allowedMarkdownUrl}
      >
        {linkedText}
      </Markdown>
    </div>
  );
}
