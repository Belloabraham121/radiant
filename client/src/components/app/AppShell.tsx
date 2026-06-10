"use client";

import { Sidebar } from "@/components/app/Sidebar";
import { SidebarProvider } from "@/components/app/SidebarContext";

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <SidebarProvider>
      <div className="flex h-screen overflow-hidden bg-[var(--hero-bg)] text-[var(--hero-ink)]">
        <Sidebar />
        <main className="flex min-w-0 flex-1 flex-col overflow-y-auto">{children}</main>
      </div>
    </SidebarProvider>
  );
}
