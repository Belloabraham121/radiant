"use client";

import { useEffect } from "react";

export type ActivePreviewSession = {
  sessionId?: string;
  projectId?: string;
  installationId?: string;
};

let activePreviewSession: ActivePreviewSession | null = null;

export function setActivePreviewSession(session: ActivePreviewSession | null): void {
  activePreviewSession = session;
}

export function getActivePreviewSession(): ActivePreviewSession | null {
  return activePreviewSession;
}

/** Register the open artifact preview for live agent stream routing (Phase 5 / 8). */
export function useActivePreviewSessionRegistration(session: ActivePreviewSession | null): void {
  useEffect(() => {
    setActivePreviewSession(session);
    return () => setActivePreviewSession(null);
  }, [session?.installationId, session?.projectId, session?.sessionId]);
}
