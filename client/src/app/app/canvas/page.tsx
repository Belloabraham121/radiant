"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CanvasFeatureGuard } from "@/components/app/CanvasFeatureGuard";
import { useCanvasWorkflows } from "@/components/canvas/canvas-workflow-context";

function CanvasIndexRedirect() {
  const router = useRouter();
  const { workflows, loading, error, createWorkflow, refreshWorkflows } = useCanvasWorkflows();
  const [creating, setCreating] = useState(false);
  const createStartedRef = useRef(false);

  useEffect(() => {
    if (loading || error || creating) return;
    if (workflows.length > 0) {
      router.replace(`/app/canvas/${workflows[0]!.id}`);
      return;
    }
    if (createStartedRef.current) return;
    createStartedRef.current = true;
    setCreating(true);
    void createWorkflow().finally(() => setCreating(false));
  }, [loading, error, creating, workflows, router, createWorkflow]);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center text-sm font-semibold text-[var(--hero-ink)]/45">
        Loading workflows…
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
        <p className="text-sm font-semibold text-[var(--hero-coral)]" role="alert">
          {error}
        </p>
        <button
          type="button"
          onClick={() => void refreshWorkflows()}
          className="rounded-full border-2 border-[var(--hero-ink)] bg-[var(--hero-amber)] px-4 py-2 text-xs font-bold shadow-[2px_2px_0_var(--hero-ink)]"
        >
          Retry
        </button>
      </div>
    );
  }

  if (creating || workflows.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-sm font-semibold text-[var(--hero-ink)]/45">
        Creating your first workflow…
      </div>
    );
  }

  return (
    <div className="flex h-full items-center justify-center text-sm font-semibold text-[var(--hero-ink)]/45">
      Opening Canvas…
    </div>
  );
}

export default function CanvasPage() {
  return (
    <CanvasFeatureGuard>
      <CanvasIndexRedirect />
    </CanvasFeatureGuard>
  );
}
