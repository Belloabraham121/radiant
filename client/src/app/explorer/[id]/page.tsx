import type { Metadata } from "next";
import { ExplorerAppDetail } from "@/components/explorer/ExplorerAppDetail";

export const metadata: Metadata = {
  title: "Agent — Radiant Explorer",
  description: "Public app listing on the Radiant explorer.",
};

export default async function AgentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ExplorerAppDetail projectId={id} />;
}
