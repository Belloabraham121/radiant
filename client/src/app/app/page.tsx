"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { ChatView } from "@/components/app/ChatView";
import { useChatSessions } from "@/components/app/chat-sessions-context";

export default function AppChatIndexPage() {
  const router = useRouter();
  const { sessions, loading } = useChatSessions();

  useEffect(() => {
    if (loading) return;
    if (sessions.length > 0) {
      router.replace(`/app/chat/${sessions[0].id}`);
    }
  }, [loading, router, sessions]);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-sm font-semibold text-[var(--hero-ink)]/45">Loading your chats…</p>
      </div>
    );
  }

  if (sessions.length > 0) {
    return null;
  }

  return <ChatView key="new-chat" />;
}
