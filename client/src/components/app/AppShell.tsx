"use client";

import { ChatSessionsProvider } from "@/components/app/ChatSessionsProvider";
import { ChatSessionActivityProvider } from "@/components/app/ChatSessionActivityProvider";
import { Sidebar } from "@/components/app/Sidebar";
import { SidebarProvider } from "@/components/app/SidebarContext";
import { AuthenticatedGate } from "@/components/auth/AuthenticatedGate";
import { AgentWalletProvider } from "@/components/wallet/AgentWalletProvider";
import { AppWalletProvider } from "@/components/wallet/AppWalletProvider";
import { NotificationServiceWorkerRegistrar } from "@/components/app/NotificationServiceWorkerRegistrar";
import { NotificationProvider } from "@/components/app/NotificationProvider";
import { NotificationToaster } from "@/components/app/NotificationToaster";

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <AuthenticatedGate>
      <ChatSessionsProvider>
        <ChatSessionActivityProvider>
            <AgentWalletProvider>
              <AppWalletProvider>
                <SidebarProvider>
                  <NotificationProvider>
                    <NotificationServiceWorkerRegistrar />
                    <NotificationToaster />
                    <div className="flex h-screen overflow-hidden bg-[var(--hero-bg)] text-[var(--hero-ink)]">
                      <Sidebar />
                      <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-x-hidden overflow-y-auto">
                        {children}
                      </main>
                    </div>
                  </NotificationProvider>
                </SidebarProvider>
              </AppWalletProvider>
            </AgentWalletProvider>
        </ChatSessionActivityProvider>
      </ChatSessionsProvider>
    </AuthenticatedGate>
  );
}
