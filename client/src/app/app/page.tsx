"use client";

import { ChatView } from "@/components/app/ChatView";
import { useChatSessions } from "@/components/app/chat-sessions-context";

export default function AppChatIndexPage() {
  const { draftResetKey } = useChatSessions();
  return <ChatView draftResetKey={draftResetKey} />;
}
