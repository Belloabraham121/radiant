"use client";

import { useState } from "react";
import { X } from "lucide-react";
import type { CanvasPolicyDetail } from "@/lib/canvas-api";
import { patchCanvasWorkflowPolicy } from "@/lib/canvas-api";

export function CanvasPolicyPanel({
  policy,
  open,
  onClose,
  onPolicyUpdated,
}: {
  workflowId: string;
  policy: CanvasPolicyDetail | null;
  open: boolean;
  onClose: () => void;
  onPolicyUpdated?: (policy: CanvasPolicyDetail) => void;
}) {
  const [draft, setDraft] = useState<CanvasPolicyDetail | null>(policy);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const activePolicy = draft ?? policy;

  const save = async () => {
    if (!activePolicy) return;
    setSaving(true);
    setError(null);
    try {
      const updated = await patchCanvasWorkflowPolicy(activePolicy.workflow_id, {
        max_spend_usd_24h: activePolicy.max_spend_usd_24h,
        max_single_action_usd: activePolicy.max_single_action_usd,
        require_deploy_approval: activePolicy.require_deploy_approval,
        kill_switch: activePolicy.kill_switch,
      });
      setDraft(updated);
      onPolicyUpdated?.(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save policy");
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  return (
    <div className="absolute right-4 top-16 z-20 w-80 max-w-[90vw] rounded-2xl border-2 border-[var(--hero-ink)] bg-white p-4 shadow-[4px_4px_0_var(--hero-ink)]">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="font-heading text-sm font-extrabold">Workflow policy</h2>
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg p-1 text-[var(--hero-ink)]/50 hover:bg-[var(--hero-ink)]/5"
          aria-label="Close policy panel"
        >
          <X className="size-4" />
        </button>
      </div>

      {activePolicy ? (
        <div className="space-y-3">
          <label className="block">
            <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--hero-ink)]/45">
              Max spend / 24h (USD)
            </span>
            <input
              type="number"
              value={activePolicy.max_spend_usd_24h}
              onChange={(e) =>
                setDraft({ ...activePolicy, max_spend_usd_24h: Number(e.target.value) })
              }
              className="mt-1 w-full rounded-lg border-2 border-[var(--hero-ink)]/20 px-2 py-1.5 text-sm font-semibold"
            />
          </label>
          <label className="block">
            <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--hero-ink)]/45">
              Max single action (USD)
            </span>
            <input
              type="number"
              value={activePolicy.max_single_action_usd}
              onChange={(e) =>
                setDraft({ ...activePolicy, max_single_action_usd: Number(e.target.value) })
              }
              className="mt-1 w-full rounded-lg border-2 border-[var(--hero-ink)]/20 px-2 py-1.5 text-sm font-semibold"
            />
          </label>
          <label className="flex items-center gap-2 text-xs font-semibold">
            <input
              type="checkbox"
              checked={activePolicy.require_deploy_approval}
              onChange={(e) =>
                setDraft({ ...activePolicy, require_deploy_approval: e.target.checked })
              }
            />
            Require confirmation before Live
          </label>
          <p className="text-[10px] font-medium text-[var(--hero-ink)]/45">
            24h spend used: ${activePolicy.spend_usd_24h.toFixed(2)}
            {activePolicy.kill_switch_active ? " · Kill switch active" : ""}
          </p>
          <button
            type="button"
            disabled={saving}
            onClick={() => void save()}
            className="w-full rounded-full border-2 border-[var(--hero-ink)] bg-[var(--hero-mint)] px-3 py-2 text-sm font-bold shadow-[2px_2px_0_var(--hero-ink)] disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save policy"}
          </button>
        </div>
      ) : (
        <p className="text-xs font-semibold text-[var(--hero-ink)]/45">Loading policy…</p>
      )}

      {error ? (
        <p className="mt-2 text-xs font-semibold text-[var(--hero-coral)]" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
