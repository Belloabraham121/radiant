"use client";

import { Sidebar } from "@/components/app/Sidebar";
import { SidebarProvider } from "@/components/app/SidebarContext";
import { AgentWalletProvider } from "@/components/wallet/AgentWalletProvider";
import { AppWalletProvider } from "@/components/wallet/AppWalletProvider";

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <AgentWalletProvider>
      <AppWalletProvider>
        <SidebarProvider>
          <div className="flex h-screen overflow-hidden bg-[var(--hero-bg)] text-[var(--hero-ink)]">
            <Sidebar />
            <main className="flex min-w-0 flex-1 flex-col overflow-y-auto">{children}</main>
          </div>
        </SidebarProvider>
      </AppWalletProvider>
    </AgentWalletProvider>
  );
}
