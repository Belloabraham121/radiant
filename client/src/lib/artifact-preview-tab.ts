const FORCE_PREVIEW_TAB_KEY = "radiant:force-artifact-preview";

/** Ask the artifact panel to switch to Preview (e.g. after sending a pinned @ message). */
export function requestArtifactPreviewTab(): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(FORCE_PREVIEW_TAB_KEY, String(Date.now()));
  } catch {
    // ignore
  }
}

/** Returns true once per request; clears the flag so it does not stick across navigations. */
export function consumeArtifactPreviewTabRequest(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const raw = sessionStorage.getItem(FORCE_PREVIEW_TAB_KEY);
    if (!raw) return false;
    sessionStorage.removeItem(FORCE_PREVIEW_TAB_KEY);
    return true;
  } catch {
    return false;
  }
}
