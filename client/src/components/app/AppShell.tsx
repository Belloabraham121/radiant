"use client";

import { ChatSessionsProvider } from "@/components/app/ChatSessionsProvider";
import { ArtifactProvider } from "@/components/app/ArtifactContext";
import { Sidebar } from "@/components/app/Sidebar";
import { SidebarProvider } from "@/components/app/SidebarContext";
import { AgentWalletProvider } from "@/components/wallet/AgentWalletProvider";
import { AppWalletProvider } from "@/components/wallet/AppWalletProvider";

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <ChatSessionsProvider>
      <ArtifactProvider>
        <AgentWalletProvider>
          <AppWalletProvider>
            <SidebarProvider>
              <div className="flex h-screen overflow-hidden bg-[var(--hero-bg)] text-[var(--hero-ink)]">
                <Sidebar />
                <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-x-hidden overflow-y-auto">
                  {children}
                </main>
              </div>
            </SidebarProvider>
          </AppWalletProvider>
        </AgentWalletProvider>
      </ArtifactProvider>
    </ChatSessionsProvider>
  );
}
