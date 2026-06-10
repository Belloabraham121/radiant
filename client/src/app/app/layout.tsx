import type { Metadata } from "next";
import { Sidebar } from "@/components/app/Sidebar";

export const metadata: Metadata = {
  title: "Radiant — Your agent",
  description: "Chat with your agent, manage your apps, and check its vault.",
};

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="hero-selection flex h-screen overflow-hidden bg-[var(--hero-bg)] text-[var(--hero-ink)]">
      <main className="flex min-w-0 flex-1 flex-col overflow-y-auto">{children}</main>
      {/* chats live on the right-hand side, as requested */}
      <Sidebar />
    </div>
  );
}
