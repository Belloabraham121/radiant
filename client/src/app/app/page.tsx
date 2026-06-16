"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { ChatView } from "@/components/app/ChatView";

function DraftChatView() {
  const searchParams = useSearchParams();
  const draftKey = searchParams.get("draft") ?? "new-chat";
  return <ChatView key={draftKey} />;
}

export default function AppChatIndexPage() {
  return (
    <Suspense fallback={<ChatView key="new-chat" />}>
      <DraftChatView />
    </Suspense>
  );
}
