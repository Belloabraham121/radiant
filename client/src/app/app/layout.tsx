import type { Metadata } from "next";
import { AppShell } from "@/components/app/AppShell";
import { siteDescription } from "@/lib/site-metadata";

export const metadata: Metadata = {
  title: "App",
  description: siteDescription,
};

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="hero-selection">
      <AppShell>{children}</AppShell>
    </div>
  );
}
