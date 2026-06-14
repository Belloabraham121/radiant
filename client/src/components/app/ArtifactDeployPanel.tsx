"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Check, Copy, ExternalLink, Globe, Loader2, Rocket } from "lucide-react";
import {
  deployLogsIndicateMock,
  fetchDeployJob,
  isDeployTerminal,
  isMockWalrusSiteUrl,
  startDeploy,
  type DeployJobView,
} from "@/lib/deploy-api";
import { useProjectWalrusUrl } from "@/hooks/useProjectWalrusUrl";

const POLL_MS = 2000;

function statusLabel(status: string): string {
  switch (status) {
    case "completed":
      return "Live on Walrus";
    case "failed":
      return "Deploy failed";
    case "cancelled":
      return "Cancelled";
    case "running":
      return "Deploying…";
    default:
      return "Queued";
  }
}

function LiveSiteLinks({
  url,
  copied,
  onCopy,
}: {
  url: string;
  copied: boolean;
  onCopy: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1.5 rounded-xl border-2 border-[var(--hero-ink)] bg-[var(--hero-mint)]/20 px-3 py-2 text-sm font-bold text-[var(--hero-ink)] hover:bg-[var(--hero-mint)]/30"
      >
        Open site
        <ExternalLink className="size-3.5" strokeWidth={2.5} aria-hidden />
      </a>
      <button
        type="button"
        onClick={onCopy}
        className="inline-flex items-center gap-1.5 rounded-xl border-2 border-[var(--hero-ink)]/20 px-3 py-2 text-sm font-bold text-[var(--hero-ink)]/70 hover:border-[var(--hero-ink)]/40"
      >
        {copied ? (
          <Check className="size-3.5" strokeWidth={2.5} aria-hidden />
        ) : (
          <Copy className="size-3.5" strokeWidth={2.5} aria-hidden />
        )}
        {copied ? "Copied" : "Copy URL"}
      </button>
    </div>
  );
}

export function ArtifactDeployPanel({
  projectId,
  disabled = false,
}: {
  projectId?: string;
  disabled?: boolean;
}) {
  const [job, setJob] = useState<DeployJobView | null>(null);
  const { liveUrl, loading: loadingMeta, refresh: refreshLiveUrl, setUrl: setLiveUrl } =
    useProjectWalrusUrl(projectId);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const pollJob = useCallback(
    async (jobId: string) => {
      try {
        const next = await fetchDeployJob(jobId);
        setJob(next);
        if (next.status === "completed" && next.walrus_url && !isMockWalrusSiteUrl(next.walrus_url)) {
          setLiveUrl(next.walrus_url);
        }
        if (isDeployTerminal(next.status)) {
          stopPolling();
          if (next.status === "completed") {
            void refreshLiveUrl();
          }
        }
      } catch (err) {
        stopPolling();
        setError(err instanceof Error ? err.message : "Failed to load deploy status");
      }
    },
    [refreshLiveUrl, setLiveUrl, stopPolling],
  );

  useEffect(() => {
    return () => stopPolling();
  }, [stopPolling]);

  const handleDeploy = async () => {
    if (!projectId || disabled || starting) return;

    setStarting(true);
    setError(null);
    setCopied(false);

    try {
      const idempotencyKey =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `${Date.now()}`;
      const result = await startDeploy(projectId, idempotencyKey);
      setJob({
        id: result.job_id,
        project_id: projectId,
        status: result.status,
        provider: result.provider,
        progress_pct: 0,
        sandbox_id: null,
        sandbox_seconds: null,
        logs_tail: "",
        error_message: null,
        walrus_url: null,
        artifact_revision: 0,
        started_at: null,
        finished_at: null,
        created_at: new Date().toISOString(),
      });

      stopPolling();
      pollRef.current = setInterval(() => {
        void pollJob(result.job_id);
      }, POLL_MS);
      void pollJob(result.job_id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start deploy");
    } finally {
      setStarting(false);
    }
  };

  const handleCopy = async (url: string) => {
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const canDeploy = Boolean(projectId) && !disabled && !starting;
  const running = job != null && !isDeployTerminal(job.status);
  const mockDeploy =
    job != null &&
    (deployLogsIndicateMock(job.logs_tail) ||
      isMockWalrusSiteUrl(job.walrus_url) ||
      (job.status === "completed" && !job.walrus_url));

  const displayUrl =
    job?.status === "completed" && job.walrus_url && !mockDeploy ? job.walrus_url : liveUrl;

  return (
    <div className="flex h-full flex-col gap-4 overflow-y-auto p-6">
      <div>
        <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--hero-violet)]">
          Walrus Sites
        </p>
        <p className="mt-1 text-sm font-medium text-[var(--hero-ink)]/60">
          Build static export and publish to decentralized hosting. Progress updates every few
          seconds.
        </p>
      </div>

      {!projectId ? (
        <p className="rounded-2xl border-2 border-dashed border-[var(--hero-ink)]/15 bg-[var(--hero-bg)]/40 p-4 text-sm font-semibold text-[var(--hero-ink)]/55">
          Save this app to a project first (generate or update via chat), then deploy from here.
        </p>
      ) : null}

      {displayUrl && !running ? (
        <div className="space-y-3 rounded-2xl border-2 border-[var(--hero-mint)]/30 bg-[var(--hero-mint)]/10 p-4">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[var(--hero-mint)]">
            <Globe className="size-3.5" strokeWidth={2.5} aria-hidden />
            Published site
          </div>
          <p className="break-all text-xs font-semibold text-[var(--hero-ink)]/70">{displayUrl}</p>
          <LiveSiteLinks
            url={displayUrl}
            copied={copied}
            onCopy={() => void handleCopy(displayUrl)}
          />
        </div>
      ) : null}

      {loadingMeta && !displayUrl ? (
        <p className="text-xs font-semibold text-[var(--hero-ink)]/45">Loading deploy status…</p>
      ) : null}

      <button
        type="button"
        onClick={() => void handleDeploy()}
        disabled={!canDeploy || running}
        className="inline-flex items-center justify-center gap-2 rounded-2xl border-2 border-[var(--hero-ink)] bg-[var(--hero-violet)] px-4 py-3 text-sm font-extrabold text-white shadow-[4px_4px_0_var(--hero-ink)] transition-transform hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none disabled:hover:translate-y-0"
      >
        {starting || running ? (
          <Loader2 className="size-4 animate-spin" aria-hidden />
        ) : (
          <Rocket className="size-4" strokeWidth={2.5} aria-hidden />
        )}
        {running ? "Deploy in progress…" : displayUrl ? "Redeploy to Walrus" : "Deploy to Walrus"}
      </button>

      {error ? (
        <p className="rounded-xl border-2 border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
          {error}
        </p>
      ) : null}

      {job ? (
        <div className="space-y-4 rounded-2xl border-2 border-[var(--hero-ink)]/10 bg-[var(--hero-bg)]/30 p-4">
          <div className="flex items-center justify-between gap-3">
            <span className="text-xs font-bold uppercase tracking-wider text-[var(--hero-ink)]/45">
              {statusLabel(job.status)}
            </span>
            <span className="font-heading text-sm font-extrabold">{job.progress_pct}%</span>
          </div>

          <div
            className="h-2 overflow-hidden rounded-full border border-[var(--hero-ink)]/15 bg-white"
            role="progressbar"
            aria-valuenow={job.progress_pct}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div
              className="h-full rounded-full bg-[var(--hero-violet)] transition-all duration-500"
              style={{ width: `${job.progress_pct}%` }}
            />
          </div>

          {job.sandbox_seconds != null && job.sandbox_seconds > 0 ? (
            <p className="text-xs font-semibold text-[var(--hero-ink)]/45">
              Sandbox time: {job.sandbox_seconds}s
            </p>
          ) : null}

          {job.logs_tail ? (
            <pre className="max-h-40 overflow-auto rounded-xl border border-[var(--hero-ink)]/10 bg-white p-3 text-[11px] leading-relaxed text-[var(--hero-ink)]/70">
              {job.logs_tail}
            </pre>
          ) : null}

          {job.error_message ? (
            <p className="text-sm font-semibold text-red-700">{job.error_message}</p>
          ) : null}

          {mockDeploy ? (
            <div className="rounded-xl border-2 border-[var(--hero-amber)]/40 bg-[var(--hero-amber)]/10 px-4 py-3 text-sm font-semibold text-[var(--hero-ink)]/80">
              <p className="font-extrabold text-[var(--hero-ink)]">Walrus publish was skipped (mock mode)</p>
              <p className="mt-2 font-medium">
                Set{" "}
                <code className="rounded bg-white/80 px-1">WALRUS_DEPLOY_MOCK=false</code> in{" "}
                <code className="rounded bg-white/80 px-1">backend/.env</code>, configure site-builder,
                run the local portal, then redeploy.
              </p>
            </div>
          ) : null}

          {job.status === "failed" ? (
            <button
              type="button"
              onClick={() => void handleDeploy()}
              disabled={!canDeploy}
              className="text-sm font-bold text-[var(--hero-violet)] underline-offset-2 hover:underline disabled:opacity-50"
            >
              Retry deploy
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
