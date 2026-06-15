"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { LayoutGrid, X } from "lucide-react";
import {
  filterChatAppScopeCandidates,
  fetchChatAppScopeCandidates,
} from "@/lib/chat-app-scope-candidates";
import {
  groupLabel,
  loadStoredChatAppScope,
  parseComposerAppMention,
  scopeToChipLabel,
  stripComposerAppMention,
  type ChatAppScope,
  type ChatAppScopeCandidate,
  type ChatAppScopeGroup,
} from "@/lib/chat-app-scope";

type ChatAppScopePickerProps = {
  sessionId?: string;
  input: string;
  onInputChange: (value: string) => void;
  scope: ChatAppScope | null;
  onScopeChange: (scope: ChatAppScope | null) => void;
  disabled?: boolean;
};

const GROUP_ORDER: ChatAppScopeGroup[] = [
  "chat_draft",
  "chat_project",
  "installed",
  "deployed",
];

export function ChatAppScopePicker({
  sessionId,
  input,
  onInputChange,
  scope,
  onScopeChange,
  disabled = false,
}: ChatAppScopePickerProps) {
  const [candidates, setCandidates] = useState<ChatAppScopeCandidate[]>([]);
  const [loading, setLoading] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const mention = useMemo(() => parseComposerAppMention(input), [input]);
  const filtered = useMemo(
    () => filterChatAppScopeCandidates(candidates, mention.filter),
    [candidates, mention.filter],
  );

  const grouped = useMemo(() => {
    const map = new Map<ChatAppScopeGroup, ChatAppScopeCandidate[]>();
    for (const group of GROUP_ORDER) {
      map.set(group, []);
    }
    for (const candidate of filtered) {
      map.get(candidate.group)?.push(candidate);
    }
    return map;
  }, [filtered]);

  const loadCandidates = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const next = await fetchChatAppScopeCandidates(sessionId);
      setCandidates(next);
    } catch {
      setLoadError("Could not load your apps.");
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  useEffect(() => {
    setCandidates([]);
  }, [sessionId]);

  useEffect(() => {
    if (mention.open && !disabled) {
      setMenuOpen(true);
      if (candidates.length === 0 && !loading) {
        void loadCandidates();
      }
    }
  }, [mention.open, disabled, candidates.length, loading, loadCandidates]);

  useEffect(() => {
    if (!menuOpen) {
      return;
    }
    const onPointerDown = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    };
    window.addEventListener("pointerdown", onPointerDown);
    return () => window.removeEventListener("pointerdown", onPointerDown);
  }, [menuOpen]);

  const selectCandidate = (candidate: ChatAppScopeCandidate) => {
    onScopeChange(candidate.scope);
    onInputChange(stripComposerAppMention(input));
    setMenuOpen(false);
  };

  const openMenu = () => {
    if (disabled) {
      return;
    }
    setMenuOpen(true);
    if (candidates.length === 0) {
      void loadCandidates();
    }
    if (!input.endsWith("@")) {
      onInputChange(input.endsWith(" ") || input.length === 0 ? `${input}@project ` : `${input} @project `);
    }
  };

  const showMenu = menuOpen && !disabled;

  return (
    <div className="relative flex items-center gap-2">
      {scope ? (
        <span className="inline-flex max-w-[14rem] items-center gap-1.5 truncate rounded-full border-2 border-[var(--hero-ink)] bg-[var(--hero-amber)]/25 px-2.5 py-1 text-[11px] font-bold text-[var(--hero-ink)]">
          <LayoutGrid className="size-3 shrink-0" strokeWidth={2.5} />
          <span className="truncate">{scopeToChipLabel(scope)}</span>
          <button
            type="button"
            aria-label="Clear app scope"
            className="rounded-full p-0.5 hover:bg-[var(--hero-ink)]/10"
            onClick={() => onScopeChange(null)}
          >
            <X className="size-3" strokeWidth={2.5} />
          </button>
        </span>
      ) : null}

      <button
        type="button"
        aria-label="Pick app scope"
        className="flex size-8 shrink-0 items-center justify-center rounded-lg border-2 border-[var(--hero-ink)]/20 text-[var(--hero-ink)]/55 transition-colors hover:border-[var(--hero-ink)] hover:text-[var(--hero-ink)] disabled:opacity-40"
        disabled={disabled}
        onClick={openMenu}
      >
        <span className="text-sm font-extrabold">@</span>
      </button>

      {showMenu ? (
        <div
          ref={menuRef}
          className="absolute bottom-full left-0 z-50 mb-2 w-[min(100vw-3rem,20rem)] overflow-hidden rounded-2xl border-2 border-[var(--hero-ink)] bg-[var(--hero-bg)] shadow-[4px_4px_0_var(--hero-ink)]"
        >
          <div className="border-b-2 border-[var(--hero-ink)]/10 px-3 py-2">
            <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--hero-ink)]/45">
              Project
            </p>
            <p className="text-xs font-semibold text-[var(--hero-ink)]/70">
              Type <span className="font-mono">@project uniswap</span> or pick an app
            </p>
          </div>

          <div className="max-h-56 overflow-y-auto p-2">
            {loading ? (
              <p className="px-2 py-3 text-xs font-medium text-[var(--hero-ink)]/45">Loading apps…</p>
            ) : null}
            {loadError ? (
              <p className="px-2 py-3 text-xs font-semibold text-[var(--hero-coral)]">{loadError}</p>
            ) : null}

            {!loading && !loadError && filtered.length === 0 ? (
              <p className="px-2 py-3 text-xs font-medium text-[var(--hero-ink)]/45">
                {sessionId
                  ? "No apps in this chat yet — build one, install from Explorer, or deploy to Walrus."
                  : "Send a message to start this chat, then @-mention an app."}
              </p>
            ) : null}

            {GROUP_ORDER.map((group) => {
              const items = grouped.get(group) ?? [];
              if (items.length === 0) {
                return null;
              }
              return (
                <div key={group} className="mb-2 last:mb-0">
                  <p className="px-2 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--hero-ink)]/35">
                    {groupLabel(group)}
                  </p>
                  <ul className="space-y-1">
                    {items.map((candidate) => (
                      <li key={candidate.key}>
                        <button
                          type="button"
                          className="flex w-full flex-col rounded-xl px-2 py-2 text-left transition-colors hover:bg-[var(--hero-amber)]/20"
                          onClick={() => selectCandidate(candidate)}
                        >
                          <span className="flex items-center gap-2">
                            <span className="truncate text-sm font-bold text-[var(--hero-ink)]">
                              {candidate.name}
                            </span>
                          </span>
                          {candidate.tagline ? (
                            <span className="truncate text-[11px] font-medium text-[var(--hero-ink)]/45">
                              {candidate.tagline}
                            </span>
                          ) : null}
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function useChatAppScope(sessionId?: string) {
  const [scope, setScope] = useState<ChatAppScope | null>(null);

  useEffect(() => {
    setScope(loadStoredChatAppScope(sessionId));
  }, [sessionId]);

  return { scope, setScope };
}
