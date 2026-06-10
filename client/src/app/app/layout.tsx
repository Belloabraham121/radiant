import type { Metadata } from "next";
import { AppShell } from "@/components/app/AppShell";

export const metadata: Metadata = {
  title: "Radiant — Your agent",
  description: "Chat with your agent, manage your apps, and check its vault.",
};

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="hero-selection">
      <AppShell>{children}</AppShell>
    </div>
  );
}
