"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import {
  Activity,
  Bell,
  ChevronsLeft,
  MessageSquare,
  PanelLeft,
  Plus,
  Sparkles,
  Trash2,
  Workflow,
} from "lucide-react";
import { LogoutButton } from "@/components/auth/LogoutButton";
import { UserAvatar } from "@/components/profile/UserAvatar";
import { DeleteChatDialog } from "@/components/app/DeleteChatDialog";
import { useNotifications } from "@/components/app/NotificationProvider";
import { useChatSessions } from "@/components/app/chat-sessions-context";
import { useChatSessionActivity } from "@/components/app/chat-session-activity-context";
import { useUserProfile } from "@/hooks/useUserProfile";
import { formatSessionTime } from "@/lib/chat-messages";
import { deleteChatSession, type ChatSessionListItem } from "@/lib/chat-api";
import { ApiError } from "@/lib/api";
import {
  SAMPLE_WORKFLOWS,
  WORKFLOW_STATUS_META,
  WORKFLOW_STATUS_ORDER,
} from "@/components/canvas/sample-workflows";
import { useSidebar } from "./SidebarContext";

const NAV: Array<{
  href: string;
  label: string;
  Icon: typeof Activity;
  planes: Array<"chat" | "canvas">;
}> = [
  { href: "/app/activity", label: "Activity", Icon: Activity, planes: ["chat"] },
  { href: "/app/notifications", label: "Notifications", Icon: Bell, planes: ["chat", "canvas"] },
];

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { open, setOpen } = useSidebar();
  const { seed, displayName } = useUserProfile();
  const { sessions, loading, error, refreshSessions, startNewChat } = useChatSessions();
  const { isSessionBusy } = useChatSessionActivity();
  const { unreadCount } = useNotifications();
  const [deleteTarget, setDeleteTarget] = useState<ChatSessionListItem | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const activeSessionId = pathname.startsWith("/app/chat/")
    ? pathname.split("/app/chat/")[1]?.split("/")[0]
    : null;

  // Which plane the sidebar list shows — derived from the route so it never
  // desyncs. The toggle just navigates between the two planes.
  const plane: "chat" | "canvas" = pathname.startsWith("/app/canvas")
    ? "canvas"
    : "chat";

  const handleNewChat = () => {
    startNewChat();
    if (pathname !== "/app") {
      router.replace("/app");
    }
    setOpen(false);
  };

  const handleNewWorkflow = () => {
    router.push("/app/canvas");
    setOpen(false);
  };

  async function confirmDeleteChat() {
    if (!deleteTarget) return;

    setDeleting(true);
    setDeleteError(null);
    try {
      await deleteChatSession(deleteTarget.id);
      if (activeSessionId === deleteTarget.id) {
        router.push("/app");
      }
      setDeleteTarget(null);
      await refreshSessions({ silent: true });
    } catch (err) {
      setDeleteError(err instanceof ApiError ? err.message : "Could not delete chat");
    } finally {
      setDeleting(false);
    }
  }

  if (!open) return null;

  return (
    <>
      <button
        type="button"
        aria-label="Close sidebar"
        className="fixed inset-0 z-40 bg-[var(--hero-ink)]/20 md:hidden"
        onClick={() => setOpen(false)}
      />

      <aside className="fixed inset-y-0 left-0 z-50 flex w-80 flex-col border-r-2 border-[var(--hero-ink)] bg-white md:relative md:z-auto md:shrink-0">
        <div className="flex flex-col gap-3 border-b-2 border-[var(--hero-ink)] px-5 py-4">
          <div className="flex items-center justify-between">
            <Link href="/" className="flex items-center gap-2 font-heading text-xl font-extrabold">
              <Sparkles className="size-5 text-[var(--hero-amber)]" strokeWidth={2.5} />
              Radiant
            </Link>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close sidebar"
              className="flex size-9 items-center justify-center rounded-full border-2 border-[var(--hero-ink)] bg-[var(--hero-bg)] transition-transform hover:-translate-y-0.5"
            >
              <ChevronsLeft className="size-4" strokeWidth={2.5} />
            </button>
          </div>
          {/* Chat ⇄ Canvas plane toggle */}
          <div className="flex items-center gap-1 rounded-full border-2 border-[var(--hero-ink)] bg-[var(--hero-bg)] p-1">
            <Link
              href="/app"
              className={`flex flex-1 items-center justify-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold transition-colors ${
                plane === "chat"
                  ? "bg-[var(--hero-ink)] text-[var(--hero-bg)]"
                  : "text-[var(--hero-ink)]/55 hover:text-[var(--hero-ink)]"
              }`}
            >
              <MessageSquare className="size-3.5" strokeWidth={2.5} />
              Chat
            </Link>
            <Link
              href="/app/canvas"
              className={`flex flex-1 items-center justify-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold transition-colors ${
                plane === "canvas"
                  ? "bg-[var(--hero-violet)] text-white"
                  : "text-[var(--hero-ink)]/55 hover:text-[var(--hero-ink)]"
              }`}
            >
              <Workflow className="size-3.5" strokeWidth={2.5} />
              Canvas
            </Link>
          </div>

          <button
            type="button"
            onClick={plane === "chat" ? handleNewChat : handleNewWorkflow}
            className="flex w-full items-center justify-center gap-1.5 rounded-full border-2 border-[var(--hero-ink)] bg-[var(--hero-amber)] px-3 py-2 text-xs font-bold shadow-[2px_2px_0_var(--hero-ink)] transition-transform hover:-translate-y-0.5"
          >
            <Plus className="size-3.5" strokeWidth={3} />
            {plane === "chat" ? "New chat" : "New workflow"}
          </button>
        </div>

        <nav className="flex flex-col gap-1.5 border-b-2 border-[var(--hero-ink)] px-4 py-3">
          {NAV.filter((item) => item.planes.includes(plane)).map(({ href, label, Icon }) => {
            const active =
              href === "/app"
                ? pathname === "/app" || pathname.startsWith("/app/chat/")
                : pathname.startsWith(href);
            const showUnreadBadge = href === "/app/notifications" && unreadCount > 0;
            return (
              <Link
                key={href}
                href={href}
                className={`flex items-center gap-2 rounded-full border-2 px-3 py-2 text-xs font-bold transition-all ${
                  active
                    ? "border-[var(--hero-ink)] bg-[var(--hero-ink)] text-[var(--hero-bg)]"
                    : "border-transparent hover:border-[var(--hero-ink)]"
                }`}
              >
                <Icon className="size-3.5" strokeWidth={2.5} />
                <span className="min-w-0 flex-1 truncate">{label}</span>
                {showUnreadBadge ? (
                  <span className="flex min-w-[1.125rem] items-center justify-center rounded-full bg-[var(--hero-coral)] px-1.5 py-0.5 text-[10px] font-extrabold leading-none text-white">
                    {unreadCount > 99 ? "99+" : unreadCount}
                  </span>
                ) : null}
              </Link>
            );
          })}
        </nav>

        <div className="flex-1 overflow-y-auto px-4 py-4">
          {plane === "canvas" ? (
            <>
              <p className="mb-3 px-2 text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--hero-ink)]/35">
                Your workflows
              </p>
              {WORKFLOW_STATUS_ORDER.map((status) => {
                const items = SAMPLE_WORKFLOWS.filter((w) => w.status === status);
                if (items.length === 0) return null;
                const meta = WORKFLOW_STATUS_META[status];
                return (
                  <div key={status} className="mb-3">
                    <p className="mb-1.5 px-2 text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--hero-ink)]/30">
                      {meta.label}
                    </p>
                    <div className="flex flex-col gap-1">
                      {items.map((w) => (
                        <Link
                          key={w.id}
                          href="/app/canvas"
                          onClick={() => setOpen(false)}
                          className="group block rounded-2xl border-2 border-transparent px-4 py-2.5 transition-all hover:border-[var(--hero-ink)] hover:bg-[var(--hero-bg)]"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="flex min-w-0 items-center gap-2">
                              <span
                                className="size-2 shrink-0 rounded-full"
                                style={{
                                  background: meta.color,
                                  opacity: meta.dim ? 0.35 : 1,
                                }}
                              />
                              <span className="truncate text-sm font-bold">{w.name}</span>
                            </span>
                            {w.lastRun ? (
                              <span className="shrink-0 text-[11px] font-bold text-[var(--hero-ink)]/35">
                                {w.lastRun}
                              </span>
                            ) : null}
                          </div>
                          {typeof w.runsToday === "number" ? (
                            <p className="mt-0.5 truncate pl-4 text-xs font-medium text-[var(--hero-ink)]/50">
                              {w.runsToday} runs today
                            </p>
                          ) : null}
                        </Link>
                      ))}
                    </div>
                  </div>
                );
              })}
              <p className="mt-2 px-2 text-[11px] font-medium text-[var(--hero-ink)]/35">
                Prototype — sample workflows.
              </p>
            </>
          ) : (
          <>
          <p className="mb-3 px-2 text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--hero-ink)]/35">
            Your chats
          </p>
          <div className="flex flex-col gap-2">
            {loading && sessions.length === 0 ? (
              <p className="px-2 text-xs font-medium text-[var(--hero-ink)]/40">Loading chats…</p>
            ) : null}

            {error ? (
              <p className="px-2 text-xs font-semibold text-[var(--hero-coral)]">{error}</p>
            ) : null}

            {!loading && sessions.length === 0 ? (
              <p className="px-2 text-xs font-medium text-[var(--hero-ink)]/40">
                No chats yet — start one above.
              </p>
            ) : null}

            {sessions.map((chat) => {
              const active = activeSessionId === chat.id;
              const deleteBlocked =
                isSessionBusy(chat.id) || chat.has_active_transaction === true;
              return (
                <div
                  key={chat.id}
                  className={`group relative rounded-2xl border-2 transition-all ${
                    active
                      ? "border-[var(--hero-ink)] bg-[var(--hero-bg)] shadow-[3px_3px_0_var(--hero-ink)]"
                      : "border-transparent hover:border-[var(--hero-ink)] hover:bg-[var(--hero-bg)]"
                  }`}
                >
                  <Link
                    href={`/app/chat/${chat.id}`}
                    className="block px-4 py-3 pr-10"
                    onClick={() => setOpen(false)}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm font-bold">{chat.title}</span>
                      <span className="shrink-0 text-[11px] font-bold text-[var(--hero-ink)]/35">
                        {formatSessionTime(chat.updated_at)}
                      </span>
                    </div>
                    {chat.preview ? (
                      <p className="mt-0.5 truncate text-xs font-medium text-[var(--hero-ink)]/50">
                        {chat.preview}
                      </p>
                    ) : null}
                  </Link>
                  {!deleteBlocked ? (
                    <button
                      type="button"
                      aria-label={`Delete ${chat.title}`}
                      onClick={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        setDeleteError(null);
                        setDeleteTarget(chat);
                      }}
                      className="absolute right-2 top-1/2 flex size-8 -translate-y-1/2 items-center justify-center rounded-full border-2 border-transparent text-[var(--hero-ink)]/35 opacity-0 transition-all hover:border-[var(--hero-ink)] hover:bg-white hover:text-[var(--hero-coral)] group-hover:opacity-100"
                    >
                      <Trash2 className="size-3.5" strokeWidth={2.5} />
                    </button>
                  ) : null}
                </div>
              );
            })}
          </div>
          </>
          )}
        </div>

        <div className="flex items-center gap-3 border-t-2 border-[var(--hero-ink)] px-5 py-4">
          <Link
            href="/app/settings"
            className="flex min-w-0 flex-1 items-center gap-3 rounded-2xl border-2 border-transparent px-1 py-1 transition-all hover:border-[var(--hero-ink)] hover:bg-[var(--hero-bg)]"
          >
            <UserAvatar seed={seed} alt={displayName} size={40} rounded="full" />
            <p className="truncate text-sm font-bold">{displayName}</p>
          </Link>
          <LogoutButton />
        </div>
      </aside>

      <DeleteChatDialog
        title={deleteTarget?.title ?? "this chat"}
        open={deleteTarget !== null}
        deleting={deleting}
        error={deleteError}
        onOpenChange={(next) => {
          if (!next && !deleting) {
            setDeleteTarget(null);
            setDeleteError(null);
          }
        }}
        onConfirm={() => void confirmDeleteChat()}
      />
    </>
  );
}

export function SidebarToggle() {
  const { open, setOpen } = useSidebar();
  if (open) return null;

  return (
    <button
      type="button"
      onClick={() => setOpen(true)}
      aria-label="Open sidebar"
      className="flex size-10 shrink-0 items-center justify-center rounded-full border-2 border-[var(--hero-ink)] bg-white shadow-[3px_3px_0_var(--hero-ink)] transition-transform hover:-translate-y-0.5"
    >
      <PanelLeft className="size-4" strokeWidth={2.5} />
    </button>
  );
}
