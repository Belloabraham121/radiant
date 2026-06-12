"use client";

import { use } from "react";
import { ChatView } from "@/components/app/ChatView";

export default function ChatSessionPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = use(params);
  return <ChatView key={sessionId} sessionId={sessionId} />;
}
