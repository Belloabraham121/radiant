"use client";

import { useState } from "react";
import { ArrowUp, LayoutDashboard, ListChecks, Sparkles } from "lucide-react";
import { SidebarToggle } from "@/components/app/Sidebar";
import { CanvasToolbar } from "./CanvasToolbar";
import { CanvasBoard } from "./CanvasBoard";
import { CanvasRunsPanel } from "./CanvasRunsPanel";
import type { CanvasMode } from "./canvas-nodes";

type CanvasTab = "editor" | "runs";

/** Matches the chat input column width/position (ChatView CHAT_COL). */
const CANVAS_INPUT_COL = "mx-auto w-full max-w-[53.76rem]";


const TABS: Array<{ id: CanvasTab; label: string; icon: typeof LayoutDashboard }> = [
  { id: "editor", label: "Editor", icon: LayoutDashboard },
  { id: "runs", label: "Runs", icon: ListChecks },
];

export function CanvasWorkspace() {
  const [mode, setMode] = useState<CanvasMode>("build");
  const [tab, setTab] = useState<CanvasTab>("editor");
  const [input, setInput] = useState("");

  return (
    <div className="flex h-full min-h-0 flex-col bg-[var(--hero-bg)]">
      <div className="flex flex-wrap items-center gap-3 border-b-2 border-[var(--hero-ink)] px-4 py-3">
        <SidebarToggle />
        {/* Open workflow name + status */}
        <span className="flex items-center gap-2">
          <span className="size-2.5 shrink-0 rounded-full bg-[var(--hero-mint)]" />
          <h1 className="font-heading text-xl font-extrabold tracking-tight">
            BTC dip buyer
          </h1>
        </span>
        <span className="rounded-full border-2 border-[var(--hero-ink)] bg-[var(--hero-violet)]/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide">
          prototype
        </span>

        {/* Editor | Runs tabs */}
        <div className="ml-auto flex items-center gap-1 rounded-full border-2 border-[var(--hero-ink)] bg-white p-1">
          {TABS.map(({ id, label, icon: Icon }) => {
            const active = tab === id;
            const hasFailures = id === "runs";
            return (
              <button
                key={id}
                type="button"
                onClick={() => setTab(id)}
                className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-bold transition-colors ${
                  active
                    ? "bg-[var(--hero-ink)] text-[var(--hero-bg)]"
                    : "text-[var(--hero-ink)]/55 hover:text-[var(--hero-ink)]"
                }`}
              >
                <Icon className="size-4" strokeWidth={2.5} />
                {label}
                {hasFailures ? (
                  <span className="flex size-4 items-center justify-center rounded-full bg-[var(--hero-coral)] text-[9px] font-extrabold text-white">
                    1
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      </div>

      {tab === "runs" ? (
        <div className="min-h-0 flex-1">
          <CanvasRunsPanel />
        </div>
      ) : (
        <EditorView mode={mode} setMode={setMode} input={input} setInput={setInput} />
      )}
    </div>
  );
}

function EditorView({
  mode,
  setMode,
  input,
  setInput,
}: {
  mode: CanvasMode;
  setMode: (m: CanvasMode) => void;
  input: string;
  setInput: (v: string) => void;
}) {
  return (
    <>
      <CanvasToolbar mode={mode} onModeChange={setMode} />

      {/* Board fills the area; chat input floats at the bottom-center, same as chat. */}
      <div className="relative min-h-0 flex-1">
        <CanvasBoard mode={mode} />

        {/* Bottom-centered agent input — same location/style as ChatView */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 px-6 pb-4">
          <form
            className="pointer-events-auto"
            onSubmit={(e) => {
              e.preventDefault();
              // Phase 0: Builder agent not wired yet.
              setInput("");
            }}
          >
            <div
              className={`${CANVAS_INPUT_COL} flex min-h-[4.5rem] flex-col gap-2 rounded-3xl border-2 border-[var(--hero-ink)] bg-[var(--hero-bg)] px-5 pb-3 pt-4 shadow-[3px_3px_0_var(--hero-ink)]`}
            >
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    setInput("");
                  }
                }}
                placeholder="Describe a workflow — “When BTC drops 5%, buy the whale’s Polymarket position…”"
                rows={1}
                className="max-h-40 min-h-6 w-full resize-none overflow-y-auto bg-transparent text-sm font-semibold leading-5 placeholder:text-[var(--hero-ink)]/35 focus:outline-none"
              />
              <div className="flex items-center justify-between gap-2">
                <span className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.15em] text-[var(--hero-ink)]/40">
                  <Sparkles className="size-3 text-[var(--hero-amber)]" strokeWidth={3} />
                  Builder
                </span>
                <button
                  type="submit"
                  aria-label="Send"
                  className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[var(--hero-ink)] text-[var(--hero-bg)] transition-transform hover:-translate-y-0.5 disabled:opacity-40"
                  disabled={!input.trim()}
                >
                  <ArrowUp className="size-5" strokeWidth={2.5} />
                </button>
              </div>
            </div>
            <p
              className={`${CANVAS_INPUT_COL} mt-2 text-center text-[11px] font-medium text-[var(--hero-ink)]/35`}
            >
              The Builder agent assembles your workflow. Live actions always ask first.
            </p>
          </form>
        </div>
      </div>
    </>
  );
}
