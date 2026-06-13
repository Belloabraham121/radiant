"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Activity,
  ChevronsLeft,
  FolderKanban,
  MessageSquare,
  PanelLeft,
  Plus,
  Settings,
  Sparkles,
} from "lucide-react";
import { LogoutButton } from "@/components/auth/LogoutButton";
import { UserAvatar } from "@/components/profile/UserAvatar";
import { useChatSessions } from "@/components/app/chat-sessions-context";
import { useUserProfile } from "@/hooks/useUserProfile";
import { useAgentWallet } from "@/components/wallet/AgentWalletProvider";
import { formatChainAddress, getChainMeta } from "@/lib/chain-meta";
import { formatSessionTime } from "@/lib/chat-messages";
import { useSidebar } from "./SidebarContext";

const NAV = [
  { href: "/app", label: "Chats", Icon: MessageSquare },
  { href: "/app/activity", label: "Activity", Icon: Activity },
  { href: "/app/projects", label: "Projects", Icon: FolderKanban },
  { href: "/app/settings", label: "Settings", Icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { open, setOpen } = useSidebar();
  const { seed, displayName } = useUserProfile();
  const { primaryWallet, defaultChainId, status } = useAgentWallet();
  const { sessions, loading, error } = useChatSessions();

  const walletLabel =
    primaryWallet?.address != null
      ? `${getChainMeta(defaultChainId).nativeSymbol} ${formatChainAddress(defaultChainId, primaryWallet.address)}`
      : status === "loading"
        ? "Setting up wallet…"
        : "No wallet";

  const activeSessionId = pathname.startsWith("/app/chat/")
    ? pathname.split("/app/chat/")[1]?.split("/")[0]
    : null;

  const handleNewChat = () => {
    router.push("/app");
    setOpen(false);
  };

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
          <button
            type="button"
            onClick={handleNewChat}
            className="flex w-full items-center justify-center gap-1.5 rounded-full border-2 border-[var(--hero-ink)] bg-[var(--hero-amber)] px-3 py-2 text-xs font-bold shadow-[2px_2px_0_var(--hero-ink)] transition-transform hover:-translate-y-0.5"
          >
            <Plus className="size-3.5" strokeWidth={3} />
            New chat
          </button>
        </div>

        <nav className="flex flex-col gap-1.5 border-b-2 border-[var(--hero-ink)] px-4 py-3">
          {NAV.map(({ href, label, Icon }) => {
            const active =
              href === "/app"
                ? pathname === "/app" || pathname.startsWith("/app/chat/")
                : pathname.startsWith(href);
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
                {label}
              </Link>
            );
          })}
        </nav>

        <div className="flex-1 overflow-y-auto px-4 py-4">
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
              return (
                <Link
                  key={chat.id}
                  href={`/app/chat/${chat.id}`}
                  className={`group rounded-2xl border-2 px-4 py-3 transition-all ${
                    active
                      ? "border-[var(--hero-ink)] bg-[var(--hero-bg)] shadow-[3px_3px_0_var(--hero-ink)]"
                      : "border-transparent hover:border-[var(--hero-ink)] hover:bg-[var(--hero-bg)]"
                  }`}
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
              );
            })}
          </div>
        </div>

        <div className="flex items-center gap-3 border-t-2 border-[var(--hero-ink)] px-5 py-4">
          <UserAvatar seed={seed} alt={displayName} size={40} rounded="full" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-bold">{displayName}</p>
            <p className="truncate font-mono text-[11px] font-semibold text-[var(--hero-ink)]/45">
              {walletLabel}
            </p>
          </div>
          <LogoutButton />
        </div>
      </aside>
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
