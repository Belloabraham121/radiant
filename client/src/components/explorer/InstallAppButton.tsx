"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowUpRight, Loader2 } from "lucide-react";
import { installPublicApp } from "@/lib/apps-api";
import { ApiError } from "@/lib/api";

export function InstallAppButton({
  projectId,
  accent,
  label = "Use this agent",
}: {
  projectId: string;
  accent: string;
  label?: string;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleInstall() {
    setLoading(true);
    setError(null);
    try {
      const result = await installPublicApp(projectId);
      router.push(`/app/installed/${result.installation_id}/run`);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        router.push(`/auth?next=${encodeURIComponent(`/explorer/${projectId}`)}`);
        return;
      }
      setError(err instanceof Error ? err.message : "Could not install this app");
      setLoading(false);
    }
  }

  return (
    <div className="flex shrink-0 flex-col items-stretch gap-2">
      <button
        type="button"
        onClick={() => void handleInstall()}
        disabled={loading}
        className="group flex items-center justify-center gap-2 rounded-full bg-[var(--hero-ink)] px-7 py-3.5 text-sm font-bold text-[var(--hero-bg)] shadow-[4px_4px_0] transition-transform hover:-translate-y-1 disabled:opacity-60"
        style={{ boxShadow: `4px 4px 0 ${accent}` }}
      >
        {loading ? (
          <Loader2 className="size-4 animate-spin" aria-hidden />
        ) : (
          <>
            {label}
            <ArrowUpRight className="size-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
          </>
        )}
      </button>
      {error ? (
        <p className="text-center text-xs font-semibold text-red-700">{error}</p>
      ) : (
        <span className="text-center text-xs font-bold text-[var(--hero-ink)]/45">
          Installs in your Radiant account
        </span>
      )}
    </div>
  );
}
