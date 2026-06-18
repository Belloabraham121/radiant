"use client";

import Link from "next/link";
import { use, useEffect, useState } from "react";
import { ArrowLeft, Loader2 } from "lucide-react";
import { ArtifactPreviewWithApproval } from "@/components/app/ArtifactPreviewWithApproval";
import { SidebarToggle } from "@/components/app/Sidebar";
import type { ArtifactPayload } from "@/lib/artifact-types";
import { NotificationAppAlertsSection } from "@/components/app/NotificationAppAlertsSection";
import { fetchProjectArtifact } from "@/lib/projects-api";

export default function ProjectRunPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [artifact, setArtifact] = useState<ArtifactPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    void fetchProjectArtifact(id)
      .then((payload) => {
        if (!cancelled) setArtifact(payload);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Could not load this app");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [id]);

  return (
    <div className="flex h-[100dvh] flex-col bg-white">
      <header className="flex shrink-0 items-center gap-3 border-b-2 border-[var(--hero-ink)]/10 px-4 py-3">
        <SidebarToggle />
        <Link
          href={`/app/projects/${id}`}
          className="flex items-center gap-1.5 text-sm font-bold text-[var(--hero-ink)]/50 transition-colors hover:text-[var(--hero-ink)]"
        >
          <ArrowLeft className="size-4" strokeWidth={2.5} />
          Back
        </Link>
        <div className="min-w-0 flex-1">
          <p className="truncate font-heading text-sm font-extrabold">
            {artifact?.name ?? "Your app"}
          </p>
          {artifact?.tagline ? (
            <p className="truncate text-xs font-medium text-[var(--hero-ink)]/50">
              {artifact.tagline}
            </p>
          ) : null}
        </div>
      </header>

      <NotificationAppAlertsSection projectId={id} compact />

      <div className="relative min-h-0 flex-1">
        {loading ? (
          <div className="flex h-full items-center justify-center gap-2 text-sm font-semibold text-[var(--hero-ink)]/45">
            <Loader2 className="size-4 animate-spin" aria-hidden />
            Loading app…
          </div>
        ) : null}

        {error ? (
          <p className="p-6 text-sm font-semibold text-red-700">{error}</p>
        ) : null}

        {artifact && !loading && !error ? (
          <ArtifactPreviewWithApproval
            files={artifact.files}
            revision={artifact.revision}
            projectId={id}
          />
        ) : null}
      </div>
    </div>
  );
}
